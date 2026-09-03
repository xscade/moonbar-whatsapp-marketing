#!/usr/bin/env bash
# Per-boot runtime initialization: start a local MongoDB instance and wait until
# it is ready. Idempotent — a already-running mongod is left in place.
set -euo pipefail

DATA_DIR="/data/db"
LOG_DIR="/var/log/mongodb"
LOG_FILE="${LOG_DIR}/mongod.log"

mkdir -p "$DATA_DIR" "$LOG_DIR"

if pgrep -x mongod >/dev/null 2>&1; then
  echo "==> mongod already running"
else
  echo "==> Starting mongod"
  mongod \
    --dbpath "$DATA_DIR" \
    --bind_ip 127.0.0.1 \
    --port 27017 \
    --logpath "$LOG_FILE" \
    --logappend \
    --fork
fi

echo "==> Waiting for MongoDB to accept connections"
for _ in $(seq 1 30); do
  if mongosh --quiet --eval 'db.runCommand({ ping: 1 })' \
      mongodb://127.0.0.1:27017 >/dev/null 2>&1; then
    echo "==> MongoDB is ready"
    exit 0
  fi
  sleep 1
done

echo "!! MongoDB did not become ready in time" >&2
tail -n 20 "$LOG_FILE" >&2 || true
exit 1
