-- AI practice insights (EDU-53): what was written, for whom, and what it
-- cost, so the per-account daily limit and the monthly budget can be
-- checked, and the same summary on the same day isn't paid for twice.
CREATE TABLE insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  -- UTC date (YYYY-MM-DD), for the daily limit.
  day TEXT NOT NULL,
  -- SHA-256 of the practice summary it was written from.
  summary_hash TEXT NOT NULL,
  -- The insight as shown (JSON).
  body TEXT NOT NULL,
  -- Estimated cost in millionths of a dollar.
  cost_micros INTEGER NOT NULL
) STRICT;
CREATE INDEX insights_user_day ON insights(user_id, day);
CREATE INDEX insights_created ON insights(created_at);
