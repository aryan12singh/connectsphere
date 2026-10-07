FROM node:22-alpine
WORKDIR /app/booking-service
RUN apk add --no-cache openssl
COPY booking-service/package*.json ./
RUN npm ci --omit=dev
COPY booking-service/prisma ./prisma
RUN npx prisma generate
COPY booking-service/src ./src
COPY utils ../utils
CMD ["sh", "-c", "if [ \"$DATA_MODE\" = \"prisma\" ]; then npx prisma migrate deploy; fi; node src/server.js"]
