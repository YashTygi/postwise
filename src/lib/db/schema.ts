import {
  pgTable, uuid, text, boolean,
  timestamp, date, integer, jsonb, smallint
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
  telegramChatId:    text('telegram_chat_id'),

  onboardingComplete: boolean('onboarding_complete').default(false),
  createdAt:          timestamp('created_at').defaultNow(),
  updatedAt:          timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────
// LinkedIn profile details (from OAuth token)
// Stored separately so we can hold structured arrays (experience, education)
// ─────────────────────────────────────────────
export const linkedinProfiles = pgTable('linkedin_profiles', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id')
                 .references(() => userProfiles.id, { onDelete: 'cascade' })
                 .notNull()
                 .unique(), // one row per user, upserted on every login

  // Core identity
  linkedinId:    text('linkedin_id'),
  headline:      text('headline'),         // current job title line
  industry:      text('industry'),
  publicUrl:     text('public_url'),
  location:      text('location'),         // "Bengaluru, Karnataka, India"
  summary:       text('summary'),          // "About" section if returned

  // Structured arrays — stored as JSONB
  // Each experience: { title, company, startDate, endDate, isCurrent, description }
  experience:    jsonb('experience'),

  // Each education: { school, degree, field, startYear, endYear }
  education:     jsonb('education'),

  // Raw token data for anything we didn't explicitly parse
  rawOauthData:  jsonb('raw_oauth_data'),

  lastSyncedAt:  timestamp('last_synced_at').defaultNow(),
  createdAt:     timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────
// Style references — pasted posts (NO scraping)
// Users can add as many "style sets" as they want,
// each named by them (e.g. "Naval Ravikant" or "My mentor's style")
// ─────────────────────────────────────────────
export const styleReferences = pgTable('style_references', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id')
                  .references(() => userProfiles.id, { onDelete: 'cascade' })
                  .notNull(),

  // User-given label for this set of posts
  sourceLabel:  text('source_label').notNull(), // "Naval Ravikant", "My own old posts", etc.

  // The actual pasted posts — stored as a JSON array of strings
  // No limit enforced in DB; app limits to reasonable count
  pastedPosts:  jsonb('pasted_posts').notNull(), // string[]

  postCount:    smallint('post_count').default(0),

  // The extracted style fingerprint JSON (populated by Gemini after save)
  styleDna:     jsonb('style_dna'),            // null until extraction runs
  dnaStatus:    text('dna_status').default('pending'), // pending | processing | done | failed

  createdAt:    timestamp('created_at').defaultNow(),
  updatedAt:    timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────
// Daily journal entries
// ─────────────────────────────────────────────
export const dailyEntries = pgTable('daily_entries', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id')
                .references(() => userProfiles.id, { onDelete: 'cascade' })
                .notNull(),
  entryDate:  date('entry_date').notNull(),
  rawInput:   text('raw_input'),
  source:     text('source').default('user'), // 'user' | 'trend'
  createdAt:  timestamp('created_at').defaultNow(),
})

// ─────────────────────────────────────────────
// Generated posts
// ─────────────────────────────────────────────
export const posts = pgTable('posts', {
  id:              uuid('id').primaryKey().defaultRandom(),
  userId:          uuid('user_id')
                     .references(() => userProfiles.id, { onDelete: 'cascade' })
                     .notNull(),
  weekOf:          date('week_of').notNull(),
  theme:           text('theme'),
  content:         text('content').notNull(),

  // Status state machine:
  // draft_generated → pending_review → approved / rejected / needs_revision
  // approved → scheduled → posted
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