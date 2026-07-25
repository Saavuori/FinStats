# Deployment

finstats follows the same pipeline as the sibling apps (`bensa`, `ratikka`,
`tieliikenne`): GitHub Actions builds a multi-arch image on every push to
`main`, and the Oracle host pulls and redeploys it on a cron.

## Pipeline

1. **Push to `main`** (with changes outside docs/scripts/deploy).
2. **`.github/workflows/docker-build.yml`**:
   - `mathieudutour/github-tag-action` bumps the version and pushes a git tag
     (default bump: `patch`).
   - Buildx builds `linux/amd64` + `linux/arm64` from the root `Dockerfile` and
     pushes three tags to GHCR: `latest`, the new `vX.Y.Z`, and the commit SHA.
   - `VERSION`, `BUILD_DATE`, `GIT_SHA` are passed as build args and baked into
     the binary via `-ldflags` (surfaced at `/api/version`).
3. **`.github/workflows/deploy-pages.yml`** (only when `CHANGELOG.md` or the
   changelog tooling changes): compiles `CHANGELOG.md` to a styled page and
   publishes it to GitHub Pages (`https://saavuori.github.io/FinStats/`).

The image is `ghcr.io/saavuori/finstats`. If the GitHub repo owner/name differs,
update the image path in `deploy/docker-compose.yml` and the changelog URL in
`frontend/src/components/VersionBadge.tsx`.

## Host (Oracle, rootless Podman)

The container is stateless — no volumes, no database. TLS is terminated by the
Caddy container in the *ratikka* stack, which reverse-proxies the public domain
to this container over the shared external `web-proxy` podman network.

```
                       :443  ┌───────────────────────┐
tilastokeskus.duckdns.org ──▶│ ratikka_ratikka-caddy │──▶ finstats:8080
                             └───────────────────────┘     (web-proxy network)
```

The live deployment uses `tilastokeskus.duckdns.org`; the domain is a parameter
everywhere, so nothing in the repo hardcodes it.

### First-time setup

DNS first: the domain must have an A/AAAA record pointing at the host (for the
Oracle box, `130.61.233.86`). Caddy provisions the certificate automatically on
the first request once that resolves.

Then run the installer on the host — it takes the domain as its only required
argument:

```bash
curl -fsSL https://raw.githubusercontent.com/Saavuori/FinStats/main/deploy/install.sh | bash -s -- tilastokeskus.duckdns.org
```

Or, from a checkout: `deploy/install.sh tilastokeskus.duckdns.org [install-dir]`
(the install dir defaults to `~/finstats`).

`deploy/install.sh` is idempotent — re-running it pulls the latest image and
redeploys without duplicating the vhost, network or cron entry. It:

1. picks the container engine (`podman-compose`, `podman compose`,
   `docker compose`, `docker-compose` — first one found),
2. copies `docker-compose.yml` + `update.sh` into the install dir (downloading
   them from GitHub when piped from `curl`),
3. creates the external `web-proxy` network if it is missing,
4. pulls the image and brings the container up,
5. appends a site block to the shared `Caddyfile` (backing it up first),
   attaches the Caddy container to `web-proxy`, and reloads Caddy:

   ```
   tilastokeskus.duckdns.org {
       reverse_proxy finstats:8080
       encode gzip zstd
   }
   ```

6. registers the 5-minute auto-update cron entry,
7. health-checks the container.

The Caddyfile is autodetected (`~/ratikka/Caddyfile`, `~/caddy/Caddyfile`,
`~/caddy-proxy/Caddyfile`, `/etc/caddy/Caddyfile`); override with `CADDYFILE=`
or `CADDY_CONTAINER=`, and skip the cron with `SKIP_CRON=1`. If no Caddyfile is
found the script prints the block to add by hand instead of failing.

If the image is ever made private, authenticate to GHCR once before installing:
`podman login ghcr.io` (needs a PAT with `read:packages`).

### Auto-update

`update.sh` runs every 5 minutes via cron; it pulls
`ghcr.io/saavuori/finstats:latest` and, if the image id changed, does a full
`down && up -d` (the reliable path under rootless Podman):

```cron
*/5 * * * * /home/opc/finstats/update.sh
```

The script resolves its own directory, so it works from whatever install dir was
chosen. A push to `main` is live within ~5 minutes of the image finishing its
build.

## Verifying a deploy

```bash
curl -s https://tilastokeskus.duckdns.org/api/version   # {"version":"vX.Y.Z",...}
curl -s https://tilastokeskus.duckdns.org/api/health    # {"status":"ok"}
podman logs --tail 50 finstats
tail -20 ~/finstats/update.log
```

## Uninstalling

```bash
cd ~/finstats && podman-compose down
crontab -l | grep -v finstats/update.sh | crontab -
# then delete the site block from the shared Caddyfile and reload Caddy
```
