#!/bin/sh
# Nightly logical backup of the CCP database (custom format).
# Usage (cron, on the machine that can reach postgres):
#   0 2 * * * /srv/ccp/server/scripts/backup.sh >> /var/log/ccp-backup.log 2>&1
#
# Env (with dev defaults): PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE,
# BACKUP_DIR (default /var/backups/ccp), KEEP_DAYS (default 14).
set -eu

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=ccp}"
: "${PGDATABASE:=ccp_time}"
: "${BACKUP_DIR:=/var/backups/ccp}"
: "${KEEP_DAYS:=14}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="$BACKUP_DIR/ccp_time-$STAMP.dump"

export PGHOST PGPORT PGUSER PGDATABASE
pg_dump --format=custom --file="$FILE"
echo "backup written to $FILE"

# Prune anything older than the retention window.
find "$BACKUP_DIR" -name 'ccp_time-*.dump' -mtime +"$KEEP_DAYS" -delete

# Restore with: pg_restore --clean --dbname=<target> <file>
