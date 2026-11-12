-- How a drummer signs in. One row per provider account: the provider and the
-- provider's own stable user ID, nothing else (no email, name or picture).
-- A GitHub and a Google sign-in are separate users; nothing links them by email.
CREATE TABLE identities (
  provider TEXT NOT NULL CHECK (provider IN ('github', 'google')),
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, subject)
) STRICT;
CREATE INDEX identities_user ON identities(user_id);

-- Signed-in browsers. The cookie holds a random token; only its SHA-256 is
-- stored, so reading this table doesn't let anyone act as a drummer.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which provider this browser signed in with, to show "Signed in with GitHub".
  provider TEXT NOT NULL CHECK (provider IN ('github', 'google')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
