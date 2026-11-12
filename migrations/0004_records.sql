-- Synced practice history: each drummer's records, exactly as the browser
-- saved them (the record's JSON). A record never changes once written, so
-- syncing is "insert if absent" by (user, record id), and a device asks for
-- what's new by the server's own sequence number.
CREATE TABLE records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The record's own ID, made by the browser that recorded it.
  id TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE (user_id, id)
) STRICT;
CREATE INDEX records_user_seq ON records(user_id, seq);
