// Prisma 7 moved the connection URL out of schema.prisma and into this file.
// The URL itself is never written down here: env() reads DATABASE_URL at run
// time, and .env stays the only place it exists.

import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 dropped automatic .env loading, so do it here. Node reads the file
// straight into process.env; the value is never held or logged by this file.
if (existsSync('.env') === true) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
