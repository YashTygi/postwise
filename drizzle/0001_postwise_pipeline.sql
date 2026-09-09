-- Postwise pipeline migration. Purely additive: no drops, no type changes.
-- Run in the Supabase SQL editor, or `npx drizzle-kit push`.

-- ── New columns ─────────────────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS github_username    text,
  ADD COLUMN IF NOT EXISTS telegram_link_code text,
  ADD COLUMN IF NOT EXISTS timezone           text DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS pending_context    jsonb;

ALTER TABLE style_references
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'craft';

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS platform        text DEFAULT 'linkedin',
  ADD COLUMN IF NOT EXISTS edited_content  text,
  ADD COLUMN IF NOT EXISTS source_ids      jsonb;

-- ── Commits ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  sha          text NOT NULL,
  repo         text NOT NULL,
  message      text NOT NULL,
  files        jsonb,
  additions    integer DEFAULT 0,
  deletions    integer DEFAULT 0,
  language     text,
  url          text,
  committed_at timestamp NOT NULL,
  created_at   timestamp DEFAULT now(),
  CONSTRAINT commits_user_sha UNIQUE (user_id, sha)
);
CREATE INDEX IF NOT EXISTS commits_user_date_idx ON commits (user_id, committed_at DESC);

-- ── Trend items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trend_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  url        text NOT NULL,
  title      text NOT NULL,
  source     text NOT NULL,
  summary    text,
  score      integer DEFAULT 0,
  reason     text,
  status     text DEFAULT 'new',
  fetched_at timestamp DEFAULT now(),
  CONSTRAINT trend_user_url UNIQUE (user_id, url)
);
CREATE INDEX IF NOT EXISTS trend_user_score_idx ON trend_items (user_id, status, score DESC);

-- ── Journal entries gain the primed-question fields ─────────────────────────
ALTER TABLE daily_entries
  ADD COLUMN IF NOT EXISTS prompt_asked  text,
  ADD COLUMN IF NOT EXISTS entry_type    text DEFAULT 'checkin',
  ADD COLUMN IF NOT EXISTS topics        text[],
  ADD COLUMN IF NOT EXISTS trend_item_id uuid REFERENCES trend_items(id) ON DELETE SET NULL;

ALTER TABLE daily_entries ALTER COLUMN source SET DEFAULT 'telegram';
CREATE INDEX IF NOT EXISTS daily_entries_user_date_idx ON daily_entries (user_id, created_at DESC);
