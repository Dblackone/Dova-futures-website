CREATE TABLE IF NOT EXISTS enquiries (
 id TEXT PRIMARY KEY,
 payload_hash TEXT NOT NULL,
 payload TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 next_attempt INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 provider_id TEXT,
 status TEXT NOT NULL DEFAULT 'pending',
 last_error TEXT
);
CREATE INDEX IF NOT EXISTS enquiries_pending ON enquiries(status, next_attempt);
CREATE INDEX IF NOT EXISTS enquiries_expiry ON enquiries(created_at);
CREATE TABLE IF NOT EXISTS rate_limits (
 key TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(expires_at);
