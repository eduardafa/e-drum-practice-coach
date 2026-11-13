-- Spending alerts already sent (EDU-58): one row per month and threshold,
-- so each email goes out at most once a month.
CREATE TABLE spend_alerts (
  -- YYYY-MM (UTC).
  month TEXT NOT NULL,
  threshold_micros INTEGER NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (month, threshold_micros)
) STRICT;
