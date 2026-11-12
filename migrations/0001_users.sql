-- One row per drummer who has signed in. Everything a drummer owns (sign-in
-- identities, sessions, practice records) references this row and is deleted
-- with it. The ID is random and means nothing outside this app.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  -- ISO 8601 instant, e.g. 2026-11-12T18:00:00.000Z.
  created_at TEXT NOT NULL
) STRICT;
