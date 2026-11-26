#!/bin/sh
# Container entrypoint: copy the workspace template into the data volume once (same semantics as desktop userData), then start the backend
set -e

if [ ! -e /app/data/workspace/.template-version ]; then
  mkdir -p /app/data/workspace
  cp -a /app/workspace-template/. /app/data/workspace/
  touch /app/data/workspace/.template-version
fi

cd /app/backend
exec node_modules/.bin/tsx src/index.ts
