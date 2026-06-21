-- Store rollback failures and make schema cleanup explicit.

ALTER TABLE import_files ADD COLUMN IF NOT EXISTS rollback_error_message TEXT;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS rollback_failed_at TIMESTAMP;

UPDATE import_files
SET rollback_query = rollback_query || ' CASCADE'
WHERE rollback_query IS NOT NULL
  AND UPPER(rollback_query) NOT LIKE '% CASCADE';
