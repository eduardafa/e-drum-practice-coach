-- Deleting a set of tips (EDU-112) erases its text but keeps the row: the
-- daily limit and the monthly budget are counted from these rows, so a
-- deleted set must still count. body becomes 'null' (as for failed calls)
-- and deleted_at says when.
ALTER TABLE insights ADD COLUMN deleted_at TEXT;
