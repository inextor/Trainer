#!/bin/sh
# Build and deploy the static site to the gh-pages branch (GitHub Pages).
#
# The site is served from the ROOT of the gh-pages branch, so this script
# copies the contents of webapp/ onto gh-pages and pushes it.
#
# Usage:  ./scripts/deploy-pages.sh
set -e

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

# 1. Regenerate the precomputed plan data (idempotent).
node scripts/build-plans.js

VERSION=$(node -p "require('./package.json').version")

WORK=$(mktemp -d)
cleanup() {
  git -C "$ROOT" worktree remove --force "$WORK/gh-pages" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# 2. Check out gh-pages into a temporary worktree.
git worktree add -f "$WORK/gh-pages" gh-pages

# 3. Replace its root with the current webapp build (keep the worktree's .git).
find "$WORK/gh-pages" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -a webapp/. "$WORK/gh-pages/"

# 4. Commit and push. --no-verify skips the version-bump pre-commit hook, which
#    only makes sense on master (the source of truth), not on the build output.
git -C "$WORK/gh-pages" add -A
if git -C "$WORK/gh-pages" diff --cached --quiet; then
  echo "gh-pages is already up to date."
else
  git -C "$WORK/gh-pages" commit --no-verify -m "Deploy v${VERSION}"
  git -C "$WORK/gh-pages" push origin gh-pages
fi

echo "Deployed v${VERSION} to gh-pages."
