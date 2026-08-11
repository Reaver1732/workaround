/**
 * The single Prisma client for the process.
 *
 * Prisma 7 requires an explicit driver adapter. The connection string is read
 * from the environment and handed straight to the adapter; it is never logged.
 */

import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Locally the URL lives in .env. On Railway it arrives as a service variable
// and no .env file exists, so only load one if it is actually there.
if (process.env.DATABASE_URL === undefined && existsSync('.env') === true) {
  process.loadEnvFile('.env');
}

const connectionString = process.env.DATABASE_URL;

if (connectionString === undefined || connectionString === '') {
  throw new Error(
    'DATABASE_URL is not set. Locally, put it in .env. On Railway, set it on ' +
    'the app service as a reference to the Postgres service.'
  );
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
