// One Prisma client for the whole service. Creating a new client per
// request would open a new pool of DB connections every time.
//
// We use Prisma's "engine-free" client (engineType = "client" in
// schema.prisma) with the `pg` driver adapter. Same Prisma API, but no
// Rust engine binary — so no platform/OpenSSL issues in Alpine Docker images.
const config = require('./config');

let prisma = null;
if (config.dataMode === 'prisma') {
  if (!config.databaseUrl) throw new Error('Missing required environment variable: DATABASE_URL');
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });
  prisma = new PrismaClient({ adapter });
}

module.exports = prisma;
