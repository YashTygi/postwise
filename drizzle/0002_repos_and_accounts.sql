-- Multi-account GitHub, repo-level understanding, and post origins.
-- Additive. Safe to re-run.

CREATE TABLE IF NOT EXISTS github_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  label          text NOT NULL,
  username       text NOT NULL,
  confidential   boolean NOT NULL DEFAULT false,
  active         boolean NOT NULL DEFAULT true,
  last_synced_at timestamp,
  created_at     timestamp DEFAULT now(),
  CONSTRAINT github_account_user_label UNIQUE (user_id, label)
);

CREATE TABLE IF NOT EXISTS repos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  account_id     uuid REFERENCES github_accounts(id) ON DELETE CASCADE,
  full_name      text NOT NULL,
  description    text,
  language       text,
  topics         text[],
  is_private     boolean DEFAULT false,
  confidential   boolean NOT NULL DEFAULT false,
  summary        jsonb,
  summary_of_sha text,
  pushed_at      timestamp,
  last_synced_at timestamp DEFAULT now(),
  CONSTRAINT repo_user_name UNIQUE (user_id, full_name)
);
CREATE INDEX IF NOT EXISTS repos_user_pushed_idx ON repos (user_id, pushed_at DESC);

ALTER TABLE commits
  ADD COLUMN IF NOT EXISTS account_id   uuid REFERENCES github_accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS confidential boolean NOT NULL DEFAULT false;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS origin text DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS brief  text;

-- Carry the existing single-account setup over so nothing is orphaned.
INSERT INTO github_accounts (user_id, label, username)
SELECT id, 'personal', github_username FROM user_profiles
WHERE github_username IS NOT NULL
ON CONFLICT (user_id, label) DO NOTHING;
