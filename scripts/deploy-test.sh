#!/usr/bin/env bash
# Deploy the committed HEAD to production (app.maharpos.shop).
#
#   scripts/deploy-test.sh
#   BUILD=root@159.89.82.196 BUILD_DIR=/var/www/maharpos-test scripts/deploy-test.sh   (build in New York)
#
# The app runs on the Singapore VPS (LIVE, close to the shops) and is built there too, in
# $LIVE_DIR/build, at the lowest CPU and disk priority so the shops on it (this app and the
# previous one) come first; they may still be slower for the few minutes a build takes.
# BUILD can point at another server (New York), and then only the finished app is sent across.
# The servers have 1 GB of RAM, so the build skips Next's type check (NEXT_SKIP_TYPECHECK=1):
# run `npx tsc --noEmit` before deploying. The running copy is kept as app.prev and restored
# if the new one fails its health check. Wallet Note (New York) and the previous app are not
# touched.
set -euo pipefail

LIVE="${LIVE:-root@157.245.61.106}"
LIVE_DIR=/var/www/maharpos
BUILD="${BUILD:-$LIVE}"
BUILD_DIR="${BUILD_DIR:-$LIVE_DIR/build}"
# The build's settings: its own shared.env in BUILD_DIR, or the live one when built in place.
if [ "$BUILD" = "$LIVE" ]; then ENV_FILE="$LIVE_DIR/shared.env"; else ENV_FILE="$BUILD_DIR/shared.env"; fi
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
ssh -o BatchMode=yes "$BUILD" mkdir -p "$BUILD_DIR"
scp -q -o BatchMode=yes "$ARCHIVE" "$BUILD:$BUILD_DIR/release.tar.gz"

# The build runs detached on the server, so a dropped connection cannot stop it; this side
# checks on it with short connections until it writes its exit code to build.status.
ssh -o BatchMode=yes "$BUILD" "cat > '$BUILD_DIR/build.sh'" <<'REMOTE'
set -euo pipefail
cd "$DIR"
# Lowest CPU and disk priority from here on, so a build never crowds out the live shops.
renice -n 19 $$ >/dev/null; ionice -c3 -p $$ 2>/dev/null || true
old_lock=$(sha1sum src/package-lock.json 2>/dev/null | cut -d' ' -f1 || true)
# Clear the last release's source (keeping installed packages and the build cache), so a
# file deleted from the repo is not left behind to break the build.
mkdir -p src && find src -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .next -exec rm -rf {} +
tar -xzf release.tar.gz -C src
echo "commit $COMMIT" > src/RELEASE
cp "$ENV_FILE" src/.env && chmod 600 src/.env
cd src
if [ "$old_lock" != "$(sha1sum package-lock.json | cut -d' ' -f1)" ] || [ ! -d node_modules ]; then
  echo "Installing packages…"
  npm ci --no-audit --no-fund >/dev/null
fi
# npm ci only regenerates the client when packages change; a schema change alone needs this.
npx prisma generate >/dev/null
echo "Building (a few minutes on 1 CPU)…"
NEXT_SKIP_TYPECHECK=1 npx next build > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
cd ..
rm -f release.tar.gz
rm -rf bundle && mkdir bundle
cp -r src/.next/standalone bundle/app
cp -r src/.next/static bundle/app/.next/static
cp -r src/public bundle/app/public
cp src/RELEASE bundle/app/RELEASE
cp -r src/prisma bundle/prisma
tar -czf bundle.tar.gz -C bundle app prisma && rm -rf bundle
# The build cache only speeds the next build; the disk here is nearly full, so it goes.
rm -rf src/.next/cache
REMOTE
ssh -o BatchMode=yes "$BUILD" "cd '$BUILD_DIR' && rm -f build.status build.out && COMMIT='$COMMIT' DIR='$BUILD_DIR' ENV_FILE='$ENV_FILE' \
  nohup setsid bash -c 'bash build.sh > build.out 2>&1; echo \$? > build.status' >/dev/null 2>&1 < /dev/null &"
shown=0
while :; do
  sleep 15
  status=$(ssh -o BatchMode=yes -o ConnectTimeout=20 "$BUILD" "cat '$BUILD_DIR/build.status' 2>/dev/null || echo running") \
    || { echo "(connection dropped; the build carries on, checking again)"; continue; }
  if lines=$(ssh -o BatchMode=yes -o ConnectTimeout=20 "$BUILD" "sed -n '$((shown + 1)),\$p' '$BUILD_DIR/build.out'") && [ -n "$lines" ]; then
    echo "$lines"
    shown=$((shown + $(printf '%s\n' "$lines" | wc -l)))
  fi
  [ "$status" = running ] && continue
  [ "$status" = 0 ] && break
  echo "Build failed (exit $status)." >&2
  exit 1
done

if [ "$BUILD" = "$LIVE" ]; then
  ssh -o BatchMode=yes "$LIVE" mv "$BUILD_DIR/bundle.tar.gz" "$LIVE_DIR/bundle.tar.gz"
else
  echo "Sending the built app to $LIVE…"
  scp -q -o BatchMode=yes "$BUILD:$BUILD_DIR/bundle.tar.gz" "$BUNDLE"
  scp -q -o BatchMode=yes "$BUNDLE" "$LIVE:$LIVE_DIR/bundle.tar.gz"
fi

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
