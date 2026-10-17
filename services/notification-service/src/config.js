require('dotenv').config();

const dataMode = process.env.DATA_MODE || 'prisma';
const databaseUrl = process.env.DATABASE_URL || '';
if (dataMode === 'prisma' && !databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  // Production uses notification_db. Unit and contract tests use memory.
  dataMode,
  databaseUrl,
  eventServiceUrl: process.env.EVENT_SERVICE_URL || 'http://localhost:3003',
  bookingServiceUrl: process.env.BOOKING_SERVICE_URL || 'http://localhost:3006',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
  userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  internalApiKey: process.env.INTERNAL_API_KEY || 'change-me-dev-internal-key',
  // CS-50 AC: retry a failed delivery 3 times, then mark it Failed.
  maxRetries: 3,
  retryDelayMs: Number(process.env.RETRY_DELAY_MS ?? 500),
  // Read notices stay in the inbox for 30 days after they were read.
  readRetentionDays: 30,
  // Durable topic and consumer names shared with the domain outbox relays.
  rabbitmqUrl: process.env.RABBITMQ_URL || '',
  rabbitmqExchange: process.env.RABBITMQ_EXCHANGE || 'connectsphere.events',
  rabbitmqQueue: process.env.RABBITMQ_QUEUE || 'notification-service.domain-events',
  isTest: process.env.NODE_ENV === 'test',
};
