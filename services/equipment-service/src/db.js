const config = require('./config');

let prisma = null;
if (config.dataMode === 'prisma') {
  if (!config.databaseUrl) throw new Error('Missing required environment variable: DATABASE_URL');
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
}

module.exports = prisma;
