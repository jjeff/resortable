#!/usr/bin/env bash
#
# Prepare a git worktree for development:
#   1. give it a node_modules (symlinked from the main checkout when the lockfiles match)
#   2. give it its own dev-server port, so parallel worktrees don't fight over 5173
#
# Idempotent and cheap to re-run — Claude Code runs it on every SessionStart.
# Run it by hand after `git worktree add` with: npm run worktree:setup
set -euo pipefail

cd "${1:-$PWD}"

git_dir=$(git rev-parse --absolute-git-dir)
common_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd)

# Main checkout, not a worktree: nothing to set up.
[ "$git_dir" = "$common_dir" ] && exit 0

main_repo=$(dirname "$common_dir")

if [ ! -e node_modules ]; then
  # Test for the install receipt, not just the directory — a stale `.vite-temp/` is enough
  # to make an otherwise-empty node_modules look installed, and linking to that produces a
  # worktree where every binary is missing.
  if [ -f "$main_repo/node_modules/.package-lock.json" ] && cmp -s package-lock.json "$main_repo/package-lock.json"; then
    # ponytail: shared node_modules, not a copy. Valid only while the lockfiles are
    # byte-identical — which is why the cmp guard above exists. Running `npm install`
    # in this worktree writes through to the main checkout; run `npm ci` here instead
    # (deletes the symlink, installs a real tree) if this branch changes dependencies.
    ln -s "$main_repo/node_modules" node_modules
    echo "worktree-setup: linked node_modules -> $main_repo/node_modules"
  else
    echo "worktree-setup: lockfile differs from main checkout, installing deps..."
    npm ci
  fi
fi

# Unique dev-server port, derived from the worktree path so a worktree recreated at
# the same path gets the same port back. Read by vite.config.ts and playwright.config.ts.
# ponytail: 100-port space, collisions unhandled. Widen the range if that ever bites.
port=$((5200 + $(printf '%s' "$PWD" | cksum | cut -d' ' -f1) % 100))

PW_PORT="$port" node -e '
  const fs = require("fs");
  const path = ".claude/settings.local.json";
  const settings = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {};
  if (settings.env?.PW_PORT) process.exit(0);
  settings.env = { ...settings.env, PW_PORT: process.env.PW_PORT };
  fs.mkdirSync(".claude", { recursive: true });
  fs.writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
  console.log(`worktree-setup: PW_PORT=${process.env.PW_PORT}`);
'
