import type { Config } from 'drizzle-kit';

// Disable SSL for localhost, require it for remote databases
const sslMode = process.env.PGHOST === 'localhost' ? 'disable' : 'require';
const connectionString = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=${sslMode}`;

export default {
  schema: './shared/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString
  }
} satisfies Config;
