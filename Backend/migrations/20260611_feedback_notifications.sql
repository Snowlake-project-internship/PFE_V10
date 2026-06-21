CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_feedback_user_id ON feedback(user_id);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    feedback_id INTEGER REFERENCES feedback(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'feedback',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS ix_notifications_sender_id ON notifications(sender_id);
CREATE INDEX IF NOT EXISTS ix_notifications_feedback_id ON notifications(feedback_id);
CREATE INDEX IF NOT EXISTS ix_notifications_is_read ON notifications(is_read);
