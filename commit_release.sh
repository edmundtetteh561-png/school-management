#!/usr/bin/env bash
# commit_release.sh — initialize git, commit all changes, tag release, create ZIP
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v git >/dev/null 2>&1; then
  echo "Git is not installed or not on PATH. Install Git and re-run this script."
  exit 1
fi
if [ ! -d .git ]; then
  echo "Initializing git repository..."
  git init
fi
git add -A || true
if git commit -m "Release: admin edit/delete, teacher edit/delete for attendance & grades, inline edit, UI polish"; then
  echo "Committed changes."
else
  echo "Nothing to commit or commit failed."
fi
if git rev-parse v1.0.0 >/dev/null 2>&1; then
  echo "Tag v1.0.0 already exists."
else
  git tag -a v1.0.0 -m "Release v1.0.0"
fi
echo "Creating release ZIP (excluding data and node_modules)..."
zip -r ../school-management-release.zip . -x "data/*" "node_modules/*" || echo "zip failed or not available"
echo "Done: ../school-management-release.zip"
