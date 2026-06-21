ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;

UPDATE users SET is_active = TRUE WHERE is_active IS NULL;

ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE;
ALTER TABLE users ALTER COLUMN is_active SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_users_is_active ON users (is_active);
CREATE INDEX IF NOT EXISTS ix_users_role_is_active ON users (role, is_active);
