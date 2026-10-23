#!/usr/bin/env bash
# Deploy the committed HEAD to production (app.maharpos.shop).
#
#   scripts/deploy-test.sh
#   BUILD=root@other.host LIVE=root@other.host scripts/deploy-test.sh
#
# The app runs on the Singapore VPS (LIVE, close to the shops). It shares that server with
# the previous app, so it is built on the New York VPS (BUILD) and only the finished app is
# sent across. Both have 1 GB of RAM, so the build skips Next's type check
# (NEXT_SKIP_TYPECHECK=1): run `npx tsc --noEmit` before deploying. The running copy is kept
# as app.prev and restored if the new one fails its health check. Wallet Note (New York)
# and the previous app (Singapore) are not touched.
set -euo pipefail

BUILD="${BUILD:-root@159.89.82.196}"
LIVE="${LIVE:-root@157.245.61.106}"
BUILD_DIR=/var/www/maharpos-test
LIVE_DIR=/var/www/maharpos
COMMIT=$(git rev-parse --short HEAD)

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes: commit first, only HEAD is deployed." >&2
  exit 1
fi

ARCHIVE=$(mktemp -t maharpos-XXXX).tar.gz
BUNDLE=$(mktemp -t maharpos-app-XXXX).tar.gz
trap 'rm -f "$ARCHIVE" "$BUNDLE"' EXIT
git archive --format=tar.gz -o "$ARCHIVE" HEAD
echo "Copying $COMMIT to $BUILD…"
scp -q -o BatchMode=yes "$ARCHIVE" "$BUILD:$BUILD_DIR/release.tar.gz"

ssh -o BatchMode=yes -o ServerAliveInterval=30 "$BUILD" COMMIT="$COMMIT" DIR="$BUILD_DIR" bash -s <<'REMOTE'
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
# npm ci only regenerates the client when packages change; a schema change alone needs this.
npx prisma generate >/dev/null
echo "Building (a few minutes on 1 CPU)…"
NEXT_SKIP_TYPECHECK=1 nice -n 19 npx next build > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
cd ..
rm -rf bundle && mkdir bundle
cp -r src/.next/standalone bundle/app
cp -r src/.next/static bundle/app/.next/static
cp -r src/public bundle/app/public
cp src/RELEASE bundle/app/RELEASE
cp -r src/prisma bundle/prisma
tar -czf bundle.tar.gz -C bundle app prisma && rm -rf bundle
REMOTE

echo "Sending the built app to $LIVE…"
scp -q -o BatchMode=yes "$BUILD:$BUILD_DIR/bundle.tar.gz" "$BUNDLE"
scp -q -o BatchMode=yes "$BUNDLE" "$LIVE:$LIVE_DIR/bundle.tar.gz"

ssh -o BatchMode=yes -o ServerAliveInterval=30 "$LIVE" DIR="$LIVE_DIR" bash -s <<'REMOTE'
set -euo pipefail
cd "$DIR"
rm -rf bundle && mkdir bundle && tar -xzf bundle.tar.gz -C bundle && rm bundle.tar.gz
echo "Migrating…"
DATABASE_URL=$(grep '^DATABASE_URL=' shared.env | cut -d'"' -f2) \
  tools/node_modules/.bin/prisma migrate deploy --schema bundle/prisma/schema.prisma 2>&1 \
  | grep -E "Applying|applied|No pending|rror" || true
rm -rf prisma && mv bundle/prisma prisma
rm -rf app.prev; [ -d app ] && mv app app.prev; mv bundle/app app; rm -rf bundle
pm2 startOrReload ecosystem.config.cjs --update-env >/dev/null
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:3020/api/health >/dev/null && { echo "Healthy: $(cat app/RELEASE)"; pm2 save >/dev/null; exit 0; }
  sleep 1
done
echo "Health check failed, rolling back to the previous copy." >&2
if [ -d app.prev ]; then rm -rf app.failed; mv app app.failed; mv app.prev app; pm2 reload maharpos --update-env >/dev/null; fi
exit 1
REMOTE
