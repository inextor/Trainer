#!/bin/sh
# Install the git hooks from scripts/git-hooks into .git/hooks.
# Run once after cloning:  ./scripts/install-hooks.sh
set -e
cd "$(dirname "$0")/.."
cp scripts/git-hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "Installed .git/hooks/pre-commit (bumps version before each commit)."
