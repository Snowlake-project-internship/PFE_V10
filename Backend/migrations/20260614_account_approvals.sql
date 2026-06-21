ALTER TABLE users
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(40) DEFAULT 'APPROVED';

UPDATE users
SET approval_status = 'APPROVED'
WHERE approval_status IS NULL;

ALTER TABLE users
ALTER COLUMN approval_status SET DEFAULT 'APPROVED';

ALTER TABLE users
ALTER COLUMN approval_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_users_approval_status
ON users(approval_status);
