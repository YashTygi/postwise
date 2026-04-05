import { pgTable, uuid, text, boolean, timestamp, date, integer, jsonb } from 'drizzle-orm/pg-core'

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey(),  // matches auth.users(id)
  fullName: text('full_name'),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  profession: text('profession'),
  contentGoal: text('content_goal'),
  targetAudience: text('target_audience'),
  postTopics: text('post_topics').array(),
  telegramChatId: text('telegram_chat_id'),
  onboardingComplete: boolean('onboarding_complete').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const styleReferences = pgTable('style_references', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => userProfiles.id, { onDelete: 'cascade' }),
  linkedinUrl: text('linkedin_url').notNull(),
  profileName: text('profile_name'),
  scrapedPosts: jsonb('scraped_posts'),
  styleDna: jsonb('style_dna'),
  scrapedAt: timestamp('scraped_at'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const dailyEntries = pgTable('daily_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => userProfiles.id, { onDelete: 'cascade' }),
  entryDate: date('entry_date').notNull(),
  rawInput: text('raw_input'),
  source: text('source').default('user'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => userProfiles.id, { onDelete: 'cascade' }),
  weekOf: date('week_of').notNull(),
  theme: text('theme'),
  content: text('content').notNull(),
  status: text('status').default('draft_generated'),
  rewriteCount: integer('rewrite_count').default(0),
  rewriteFeedback: text('rewrite_feedback'),
  scheduledFor: timestamp('scheduled_for'),
  postedAt: timestamp('posted_at'),
  createdAt: timestamp('created_at').defaultNow(),
})

export type UserProfile = typeof userProfiles.$inferSelect
export type NewUserProfile = typeof userProfiles.$inferInsert
export type Post = typeof posts.$inferSelect