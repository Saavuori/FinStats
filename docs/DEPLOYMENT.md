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
Caddy container in the *ratikka* stack, which reverse-proxies
`finstats.duckdns.org` to this container over the shared external `web-proxy`
podman network.

### First-time setup

```bash
mkdir -p /home/opc/finstats
cd /home/opc/finstats
# copy deploy/docker-compose.yml and deploy/update.sh here
cp /path/to/repo/deploy/docker-compose.yml .
cp /path/to/repo/deploy/update.sh .
chmod +x update.sh

# authenticate to GHCR once (needs a PAT with read:packages if the image is private)
podman login ghcr.io

podman-compose up -d
```

Add the Caddy route in the ratikka stack's `Caddyfile`:

```
finstats.duckdns.org {
    reverse_proxy finstats:8080
}
```

### Auto-update

`deploy/update.sh` runs every 5 minutes via cron; it pulls
`ghcr.io/saavuori/finstats:latest` and, if the image id changed, does a full
`podman-compose down && up -d` (the reliable path under rootless Podman):

```cron
*/5 * * * * /home/opc/finstats/update.sh
```

So a push to `main` is live within ~5 minutes of the image finishing its build.

## Verifying a deploy

```bash
curl -s https://finstats.duckdns.org/api/version   # {"version":"vX.Y.Z",...}
curl -s https://finstats.duckdns.org/api/health    # {"status":"ok"}
```
