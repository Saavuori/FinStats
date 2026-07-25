#!/usr/bin/env bash
# One-shot installer for finstats on a Podman/Docker host that already runs a
# Caddy reverse proxy (the Oracle host's shared `web-proxy` network setup).
#
#   ./install.sh <domain> [install-dir]
#   curl -fsSL https://raw.githubusercontent.com/Saavuori/FinStats/main/deploy/install.sh \
#     | bash -s -- tilastokeskus.duckdns.org
#
# It is idempotent: re-running it updates the deployment instead of duplicating
# the vhost, the network or the cron entry.
set -euo pipefail

# REPO_REF lets you test the installer from a branch before it is merged:
#   curl -fsSL .../<branch>/deploy/install.sh | REPO_REF=<branch> bash -s -- <domain>
REPO_REF="${REPO_REF:-main}"
REPO_RAW="https://raw.githubusercontent.com/Saavuori/FinStats/${REPO_REF}/deploy"
PROXY_NETWORK="web-proxy"      # must match the external network in docker-compose.yml
SERVICE_HOST="finstats:8080"   # container name + port Caddy proxies to

DOMAIN="${1:-}"
INSTALL_DIR="${2:-$HOME/finstats}"

info()  { echo "==> $*"; }
warn()  { echo "!!  $*" >&2; }
die()   { echo "!!  $*" >&2; exit 1; }

usage() {
  cat >&2 <<EOF
Usage: install.sh <domain> [install-dir]

  <domain>       public hostname Caddy should serve, e.g. tilastokeskus.duckdns.org
                 (must already have an A/AAAA record pointing at this host)
  [install-dir]  where the stack lives (default: \$HOME/finstats)

Environment overrides:
  CADDYFILE        path to the shared Caddyfile (default: autodetected)
  CADDY_CONTAINER  name of the running Caddy container (default: autodetected)
  REPO_REF         branch to download the stack files from (default: main)
  SKIP_CRON=1      do not install the 5-minute auto-update cron entry
EOF
  exit 2
}

[ -n "$DOMAIN" ] || usage
case "$DOMAIN" in
  -h|--help) usage ;;
  *[!A-Za-z0-9.-]*|-*|.*|*.) die "'$DOMAIN' does not look like a hostname" ;;
  *.*) : ;;
  *) die "'$DOMAIN' does not look like a fully qualified domain name" ;;
esac

# ---------------------------------------------------------------- engine ----
if command -v podman-compose >/dev/null 2>&1; then
  ENGINE=podman; COMPOSE="podman-compose"
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  ENGINE=podman; COMPOSE="podman compose"
elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ENGINE=docker; COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  ENGINE=docker; COMPOSE="docker-compose"
else
  die "no container engine found — install podman-compose or docker compose first"
fi
info "Using $COMPOSE ($ENGINE)"

# ------------------------------------------------------------ stack files ----
# Run from a checkout, copy the sibling files; piped through `curl | bash` there
# is no source directory (BASH_SOURCE is unset), so download them instead. The
# three-file check keeps an unrelated docker-compose.yml in the current working
# directory from being mistaken for this repo's deploy/.
SRC_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ]; then
  SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  [ -f "$SRC_DIR/docker-compose.yml" ] && [ -f "$SRC_DIR/update.sh" ] \
    && [ -f "$SRC_DIR/install.sh" ] || SRC_DIR=""
fi

fetch() { # fetch <filename>
  if [ -z "$SRC_DIR" ]; then
    curl -fsSL "$REPO_RAW/$1" -o "$INSTALL_DIR/$1"
  elif [ "$SRC_DIR" != "$INSTALL_DIR" ]; then
    cp "$SRC_DIR/$1" "$INSTALL_DIR/$1"
  fi
}

info "Installing into $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
INSTALL_DIR="$(cd "$INSTALL_DIR" && pwd)"   # cron and update.sh need it absolute
fetch docker-compose.yml
fetch update.sh
chmod +x "$INSTALL_DIR/update.sh"

# --------------------------------------------------------------- network ----
if $ENGINE network inspect "$PROXY_NETWORK" >/dev/null 2>&1; then
  info "Network '$PROXY_NETWORK' already exists"
else
  info "Creating external network '$PROXY_NETWORK'"
  $ENGINE network create "$PROXY_NETWORK" >/dev/null
fi

# ----------------------------------------------------------------- deploy ----
info "Pulling and starting the finstats container"
cd "$INSTALL_DIR"
$COMPOSE pull
$COMPOSE up -d

# ------------------------------------------------------------------ caddy ----
if [ -z "${CADDYFILE:-}" ]; then
  for candidate in "$HOME/ratikka/Caddyfile" "$HOME/caddy/Caddyfile" \
                   "$HOME/caddy-proxy/Caddyfile" "/etc/caddy/Caddyfile"; do
    [ -f "$candidate" ] && { CADDYFILE="$candidate"; break; }
  done
fi

VHOST=$(cat <<EOF

$DOMAIN {
    reverse_proxy $SERVICE_HOST
    encode gzip zstd
}
EOF
)

CADDY_READY=0
if [ -n "${CADDYFILE:-}" ] && [ -f "$CADDYFILE" ]; then
  CADDY_READY=1
  if grep -qE "^[[:space:]]*(https?://)?$DOMAIN[[:space:]]*\{" "$CADDYFILE"; then
    info "Caddyfile already has a site block for $DOMAIN — leaving it alone"
  else
    info "Adding $DOMAIN to $CADDYFILE (backup: $CADDYFILE.bak)"
    cp "$CADDYFILE" "$CADDYFILE.bak"
    printf '%s\n' "$VHOST" >> "$CADDYFILE"
  fi

  CADDY_CONTAINER="${CADDY_CONTAINER:-$($ENGINE ps --format '{{.Names}}' 2>/dev/null \
      | tr ' ' '\n' | grep -i caddy | head -1 || true)}"
  if [ -n "$CADDY_CONTAINER" ]; then
    # Caddy must share the proxy network to resolve the finstats container by name.
    $ENGINE network connect "$PROXY_NETWORK" "$CADDY_CONTAINER" >/dev/null 2>&1 || true
    info "Reloading Caddy ($CADDY_CONTAINER)"
    $ENGINE exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile \
      || $ENGINE restart "$CADDY_CONTAINER" >/dev/null
  else
    CADDY_READY=0
    warn "No running Caddy container found — start it and reload to pick up the new vhost."
  fi
else
  warn "No Caddyfile found. Add this to your proxy config and reload Caddy:"
  printf '%s\n' "$VHOST" >&2
  warn "The Caddy container must also be attached to the '$PROXY_NETWORK' network."
fi

# ------------------------------------------------------------------- cron ----
if [ "${SKIP_CRON:-0}" = "1" ]; then
  info "Skipping cron installation (SKIP_CRON=1)"
elif ! command -v crontab >/dev/null 2>&1; then
  warn "crontab not available — schedule '$INSTALL_DIR/update.sh' every 5 minutes yourself"
elif crontab -l 2>/dev/null | grep -Fq "$INSTALL_DIR/update.sh"; then
  info "Auto-update cron entry already installed"
else
  info "Installing 5-minute auto-update cron entry"
  (crontab -l 2>/dev/null; echo "*/5 * * * * $INSTALL_DIR/update.sh") | crontab -
fi

# ------------------------------------------------------------------ check ----
if $ENGINE exec finstats wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
  info "Container is healthy"
else
  warn "Health check inside the container failed — see: $ENGINE logs finstats"
fi

if [ "$CADDY_READY" = "1" ]; then
  cat <<EOF

==> Done. finstats is running behind Caddy.

    https://$DOMAIN            the app
    https://$DOMAIN/api/health {"status":"ok"}

    Caddy issues the TLS certificate on the first request, so give it a few
    seconds — and make sure $DOMAIN resolves to this host.
EOF
else
  cat <<EOF

==> The finstats container is up, but the proxy still needs the site block
    above. Once Caddy serves $DOMAIN, check https://$DOMAIN/api/health.
EOF
fi

cat <<EOF

    Updates: $INSTALL_DIR/update.sh runs every 5 minutes and redeploys when a
    new image is pushed to ghcr.io/saavuori/finstats:latest.
    Logs: $INSTALL_DIR/update.log
EOF
