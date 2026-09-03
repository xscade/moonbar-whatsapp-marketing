#!/usr/bin/env bash
# Idempotent repository bootstrap: refresh Node dependencies and ensure a local
# development env file exists. Safe to run repeatedly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing Node dependencies (npm ci)"
npm ci

if [ ! -f .env.local ]; then
  echo "==> Creating .env.local from .env.example"
  cp .env.example .env.local
else
  echo "==> .env.local already present, leaving it unchanged"
fi

echo "==> Install complete"
