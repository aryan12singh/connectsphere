FROM node:22-alpine
WORKDIR /app/notification-service
RUN apk add --no-cache openssl
COPY notification-service/package*.json ./
RUN npm ci --omit=dev
COPY notification-service/prisma ./prisma
RUN npx prisma generate
COPY notification-service/src ./src
COPY utils ../utils
CMD ["sh", "-c", "if [ \"$DATA_MODE\" = \"prisma\" ]; then npx prisma migrate deploy; fi; node src/server.js"]
