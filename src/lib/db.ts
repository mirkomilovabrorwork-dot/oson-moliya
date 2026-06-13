import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Global cache to survive serverless cold starts + HMR in dev
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  // PrismaNeon v6: constructor accepts a PoolConfig object (plain config, not Pool instance)
  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

// Lazy singleton, cached in ALL environments. Never instantiates at module load
// time (safe for `next build`). Caching in production too is the correct serverless
// pattern: a warm function instance reuses one client instead of opening a new Neon
// connection on every property access (which the previous per-call version did).
export function getDb(): PrismaClient {
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  return global.__prisma;
}

/** Convenience re-export so callers can just `import { db } from "@/lib/db"` */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
