#!/usr/bin/env bash
# Deploy the committed HEAD to the test site (test.maharpos.shop) on the VPS.
#
#   scripts/deploy-test.sh            # uses root@159.89.82.196
#   VPS=root@other.host scripts/deploy-test.sh
#
# Builds on the VPS, so the Prisma engine matches the server. The VPS has 1 GB of RAM, so
# the build skips Next's type check (NEXT_SKIP_TYPECHECK=1): run `npx tsc --noEmit` before
# deploying. The running copy is kept as app.prev and restored if the new one fails its
# health check. Wallet Note on the same server is not touched.
set -euo pipefail

VPS="${VPS:-root@159.89.82.196}"
DIR=/var/www/maharpos-test
COMMIT=$(git rev-parse --short HEAD)

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes: commit first, only HEAD is deployed." >&2
  exit 1
fi

ARCHIVE=$(mktemp -t maharpos-XXXX).tar.gz
git archive --format=tar.gz -o "$ARCHIVE" HEAD
echo "Copying $COMMIT to $VPS…"
scp -q -o BatchMode=yes "$ARCHIVE" "$VPS:$DIR/release.tar.gz"
rm -f "$ARCHIVE"

ssh -o BatchMode=yes -o ServerAliveInterval=30 "$VPS" COMMIT="$COMMIT" DIR="$DIR" bash -s <<'REMOTE'
set -euo pipefail
cd "$DIR"
old_lock=$(sha1sum src/package-lock.json 2>/dev/null | cut -d' ' -f1 || true)
mkdir -p src && tar -xzf release.tar.gz -C src
echo "commit $COMMIT" > src/RELEASE
cp shared.env src/.env && chmod 600 src/.env
cd src
if [ "$old_lock" != "$(sha1sum package-lock.json | cut -d' ' -f1)" ] || [ ! -d node_modules ]; then
  echo "Installing packages…"
  nice -n 15 npm ci --no-audit --no-fund >/dev/null
fi
echo "Migrating…"
npx prisma migrate deploy 2>&1 | grep -E "Applying|applied|No pending|error" || true
# npm ci only regenerates the client when packages change; a schema change alone needs this,
# or the app runs against the old model and rejects every new field.
npx prisma generate >/dev/null
echo "Building (a few minutes on 1 CPU)…"
NEXT_SKIP_TYPECHECK=1 nice -n 19 npx next build > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
cd ..
rm -rf app.new && cp -r src/.next/standalone app.new
cp -r src/.next/static app.new/.next/static
cp -r src/public app.new/public
cp src/RELEASE app.new/RELEASE
rm -rf app.prev; [ -d app ] && mv app app.prev; mv app.new app
pm2 startOrReload ecosystem.config.cjs --update-env >/dev/null
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:3020/api/health >/dev/null && { echo "Healthy: $(cat app/RELEASE)"; pm2 save >/dev/null; exit 0; }
  sleep 1
done
echo "Health check failed, rolling back to the previous copy." >&2
if [ -d app.prev ]; then rm -rf app.failed; mv app app.failed; mv app.prev app; pm2 reload maharpos-test --update-env >/dev/null; fi
exit 1
REMOTE
