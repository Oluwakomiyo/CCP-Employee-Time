#!/bin/sh
# Applies pending migrations, then runs the given command (api or worker).
set -e
npx prisma migrate deploy
exec "$@"
