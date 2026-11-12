-- How much each drummer has synced, kept up to date on every upload and
-- delete, so the storage limit is checked without reading every record.
ALTER TABLE users ADD COLUMN record_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN record_bytes INTEGER NOT NULL DEFAULT 0;
UPDATE users SET
  record_count = (SELECT COUNT(*) FROM records WHERE records.user_id = users.id),
  record_bytes = (SELECT COALESCE(SUM(LENGTH(body)), 0) FROM records WHERE records.user_id = users.id);
