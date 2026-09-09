import {
  pgTable, uuid, text, boolean,
  timestamp, date, integer, jsonb, smallint, unique
} from 'drizzle-orm/pg-core'

// ─────────────────────────────────────────────
// Users (extends Supabase auth.users)
// ─────────────────────────────────────────────
export const userProfiles = pgTable('user_profiles', {
  id:                uuid('id').primaryKey(), // = auth.users.id
  fullName:          text('full_name'),
  email:             text('email'),
  avatarUrl:         text('avatar_url'),

  // LinkedIn OAuth data — populated at first OAuth login, kept fresh on every login
  linkedinId:        text('linkedin_id'),
  linkedinHeadline:  text('linkedin_headline'),   // "Senior Flutter Dev at Acme"
  linkedinIndustry:  text('linkedin_industry'),   // "Software Development"
  linkedinPublicUrl: text('linkedin_public_url'), // their public profile URL

  // Onboarding answers
  profession:        text('profession'),
  contentGoal:       text('content_goal'),
  targetAudience:    text('target_audience'),
  postTopics:        text('post_topics').array(),

  // Ingestion + bot wiring
  githubUsername:    text('github_username'),
  telegramChatId:    text('telegram_chat_id'),
  telegramLinkCode:  text('telegram_link_code'),  // shown on /settings, sent as `/link CODE`
  timezone:          text('timezone').default('Asia/Kolkata'),

  // What the bot is waiting for. Cleared once the reply lands.
  // { kind: 'checkin', entryId } | { kind: 'opinion', trendItemId } | { kind: 'edit', postId }
  pendingContext:    jsonb('pending_context'),

  onboardingComplete: boolean('onboarding_complete').default(false),
  createdAt:          timestamp('created_at').defaultNow(),
  updatedAt:          timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────
// LinkedIn profile details (from OAuth token)
// ─────────────────────────────────────────────
export const linkedinProfiles = pgTable('linkedin_profiles', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id')
                 .references(() => userProfiles.id, { onDelete: 'cascade' })
                 .notNull()
                 .unique(),

  linkedinId:    text('linkedin_id'),
  headline:      text('headline'),
  industry:      text('industry'),
  publicUrl:     text('public_url'),
  location:      text('location'),
  summary:       text('summary'),

  experience:    jsonb('experience'),
  education:     jsonb('education'),
  rawOauthData:  jsonb('raw_oauth_data'),

  lastSyncedAt:  timestamp('last_synced_at').defaultNow(),
  createdAt:     timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────
// Style references — pasted posts (NO scraping)
//
// Two independent axes, per the design:
//   kind='positioning' → people you want to become like. Shapes TOPIC SELECTION.
//   kind='craft'       → writing you like. Shapes EXECUTION.
// ─────────────────────────────────────────────
export const styleReferences = pgTable('style_references', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id')
                  .references(() => userProfiles.id, { onDelete: 'cascade' })
                  .notNull(),

  sourceLabel:  text('source_label').notNull(),
  kind:         text('kind').default('craft').notNull(), // 'craft' | 'positioning'

  pastedPosts:  jsonb('pasted_posts').notNull(), // string[]
  postCount:    smallint('post_count').default(0),

  styleDna:     jsonb('style_dna'),
  dnaStatus:    text('dna_status').default('pending'), // pending | processing | done | failed

  createdAt:    timestamp('created_at').defaultNow(),
  updatedAt:    timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────
// GitHub commits — the "what did you actually do" signal
// Full diffs are deliberately NOT stored: filenames + message + line
// counts carry the signal without burning context.
// ─────────────────────────────────────────────
export const commits = pgTable('commits', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id')
                 .references(() => userProfiles.id, { onDelete: 'cascade' })
                 .notNull(),
  sha:         text('sha').notNull(),
  repo:        text('repo').notNull(),          // "owner/name"
  message:     text('message').notNull(),
  files:       jsonb('files'),                  // string[] of changed paths
  additions:   integer('additions').default(0),
  deletions:   integer('deletions').default(0),
  language:    text('language'),                // derived from file extensions
  url:         text('url'),
  committedAt: timestamp('committed_at').notNull(),
  createdAt:   timestamp('created_at').defaultNow(),
}, t => [unique('commits_user_sha').on(t.userId, t.sha)])

// ─────────────────────────────────────────────
// Trend items — scored for relevance to YOUR recent work, not raw popularity
// ─────────────────────────────────────────────
export const trendItems = pgTable('trend_items', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id')
               .references(() => userProfiles.id, { onDelete: 'cascade' })
               .notNull(),
  url:       text('url').notNull(),
  title:     text('title').notNull(),
  source:    text('source').notNull(),          // hackernews | devto | reddit | rss:<host>
  summary:   text('summary'),
  score:     integer('score').default(0),       // 0–100, relevance to this user
  reason:    text('reason'),                    // why the model scored it that way
  status:    text('status').default('new'),     // new | shown | opined | dismissed
  fetchedAt: timestamp('fetched_at').defaultNow(),
}, t => [unique('trend_user_url').on(t.userId, t.url)])

// ─────────────────────────────────────────────
// Daily journal entries — THE asset. Everything else is decoration.
// A row is created when the question is asked (rawInput null), and
// filled in when the answer arrives.
// ─────────────────────────────────────────────
export const dailyEntries = pgTable('daily_entries', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id')
                  .references(() => userProfiles.id, { onDelete: 'cascade' })
                  .notNull(),
  entryDate:    date('entry_date').notNull(),
  promptAsked:  text('prompt_asked'),           // the primed question we sent
  rawInput:     text('raw_input'),              // null until they answer
  entryType:    text('entry_type').default('checkin'), // checkin | opinion | adhoc
  topics:       text('topics').array(),         // extracted after the answer lands
  trendItemId:  uuid('trend_item_id').references(() => trendItems.id, { onDelete: 'set null' }),
  source:       text('source').default('telegram'), // telegram | web | voice
  createdAt:    timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────
// Generated posts
// editedContent stores YOUR rewrite next to the draft. The last few
// (draft, edit) pairs get fed back as few-shot examples — quality climbs
// with no fine-tuning.
// ─────────────────────────────────────────────
export const posts = pgTable('posts', {
  id:              uuid('id').primaryKey().defaultRandom(),
  userId:          uuid('user_id')
                     .references(() => userProfiles.id, { onDelete: 'cascade' })
                     .notNull(),
  weekOf:          date('week_of').notNull(),
  theme:           text('theme'),
  platform:        text('platform').default('linkedin'), // linkedin | twitter | blog
  content:         text('content').notNull(),
  editedContent:   text('edited_content'),
  sourceIds:       jsonb('source_ids'),          // { commits: [], entries: [], trends: [] }

  // draft_generated → pending_review → approved / rejected / needs_revision
  status:          text('status').default('draft_generated'),

  rewriteCount:    integer('rewrite_count').default(0),
  rewriteFeedback: text('rewrite_feedback'),
  scheduledFor:    timestamp('scheduled_for'),
  postedAt:        timestamp('posted_at'),
  createdAt:       timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────
export type UserProfile       = typeof userProfiles.$inferSelect
export type NewUserProfile    = typeof userProfiles.$inferInsert
export type LinkedinProfile   = typeof linkedinProfiles.$inferSelect
export type StyleReference    = typeof styleReferences.$inferSelect
export type Post              = typeof posts.$inferSelect
export type DailyEntry        = typeof dailyEntries.$inferSelect
export type Commit            = typeof commits.$inferSelect
export type TrendItem         = typeof trendItems.$inferSelect
