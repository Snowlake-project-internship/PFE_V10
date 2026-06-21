-- Persist import status and user-visible failure details in PostgreSQL.

ALTER TABLE import_files ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS rows_inserted INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS imported_tables JSON;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'PENDING' NOT NULL;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS rollback_status VARCHAR(40) DEFAULT 'PENDING' NOT NULL;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS rollback_query TEXT;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMP;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS error_type VARCHAR(255);
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS failure_step VARCHAR(255);
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS sql_error_details TEXT;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS failed_table_name VARCHAR(500);

UPDATE import_files AS imported
SET organization_id = users.organization_id
FROM users
WHERE imported.organization_id IS NULL
  AND imported.user_id = users.id;

CREATE INDEX IF NOT EXISTS ix_import_files_org_uploaded ON import_files (organization_id, uploaded_at);
CREATE INDEX IF NOT EXISTS ix_import_files_status_uploaded ON import_files (status, uploaded_at);
CREATE INDEX IF NOT EXISTS ix_import_files_rollback_status ON import_files (rollback_status);
