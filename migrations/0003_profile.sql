-- What the account menu shows (owner decision, 2026-11-12): the display name
-- and profile picture link from GitHub or Google. Refreshed at each sign-in
-- and deleted with the user. No email.
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
