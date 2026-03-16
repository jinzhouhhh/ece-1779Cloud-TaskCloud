#!/usr/bin/env bash
#
# Restore a PostgreSQL backup
# Usage: ./restore.sh /path/to/taskcloud_YYYYMMDD_HHMMSS.sql.gz

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
DB_CONTAINER="${DB_CONTAINER:-taskcloud_db}"
DB_NAME="${DB_NAME:-taskcloud}"
DB_USER="${DB_USER:-taskcloud}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "[$(date)] Restoring from: $BACKUP_FILE"
echo "WARNING: This will overwrite the current database. Press Ctrl+C to abort."
sleep 5

gunzip -c "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"

echo "[$(date)] Restore complete"
