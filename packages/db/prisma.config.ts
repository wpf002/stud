import path from 'node:path';
import { config } from 'dotenv';
import type { PrismaConfig } from 'prisma';

// One .env at the workspace root feeds the Prisma CLI too.
config({ path: path.join(__dirname, '..', '..', '.env') });

export default {
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx src/seed.ts',
  },
} satisfies PrismaConfig;
