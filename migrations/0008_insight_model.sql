-- Which model wrote each insight (EDU-57: Claude or OpenAI, chosen in the app).
-- Insights written before this were all Claude Haiku 5.5.
ALTER TABLE insights ADD COLUMN model TEXT NOT NULL DEFAULT 'claude-haiku-5-5';
