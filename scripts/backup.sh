#!/usr/bin/env bash
#
# Automated PostgreSQL backup script
# Designed to run as a cron job (e.g., nightly at 2 AM):
#   0 2 * * * /opt/taskcloud/scripts/backup.sh >> /var/log/taskcloud-backup.log 2>&1
#
# Stores backups locally and optionally uploads to DigitalOcean Spaces.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/taskcloud/backups}"
DB_CONTAINER="${DB_CONTAINER:-taskcloud_db}"
DB_NAME="${DB_NAME:-taskcloud}"
DB_USER="${DB_USER:-taskcloud}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/taskcloud_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# Dump from the running PostgreSQL container
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

echo "[$(date)] Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Remove old backups
find "$BACKUP_DIR" -name "taskcloud_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Cleaned up backups older than ${RETENTION_DAYS} days"

# Upload to DigitalOcean Spaces (if s3cmd is configured)
if command -v s3cmd &> /dev/null && [ -n "${DO_SPACES_BUCKET:-}" ]; then
  s3cmd put "$BACKUP_FILE" "s3://${DO_SPACES_BUCKET}/backups/$(basename "$BACKUP_FILE")"
  echo "[$(date)] Uploaded to Spaces: s3://${DO_SPACES_BUCKET}/backups/$(basename "$BACKUP_FILE")"
fi

echo "[$(date)] Backup complete"
