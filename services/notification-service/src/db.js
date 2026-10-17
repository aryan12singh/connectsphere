// One Prisma client for the whole service. The engine-free client uses the
// pg adapter, matching the database-backed auth and user services.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const config = require('./config');

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
