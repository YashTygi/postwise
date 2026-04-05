import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// Load the environment variables from your .env or .env.local file
config({ path: '.env.local' }); // Change to '.env' if you are using a standard .env file

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;