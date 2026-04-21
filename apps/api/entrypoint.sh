#!/bin/sh
set -e

echo "Running migrations..."
node apps/api/node_modules/typeorm/cli.js migration:run -d apps/api/dist/db/data-source.js

echo "Starting API..."
exec node apps/api/dist/main.js
