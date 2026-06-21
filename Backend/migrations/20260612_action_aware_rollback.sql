ALTER TABLE import_files
ADD COLUMN IF NOT EXISTS rollback_plan JSON;
