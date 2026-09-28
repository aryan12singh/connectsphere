// One Prisma client for the whole service. Creating a new client per
// request would open a new pool of DB connections every time.
//
// We use Prisma's "engine-free" client (engineType = "client" in
// schema.prisma) with the `pg` driver adapter. Same Prisma API, but no
// Rust engine binary — so no platform/OpenSSL issues in Alpine Docker images.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const config = require('./config');

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
