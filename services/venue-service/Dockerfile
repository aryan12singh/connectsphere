FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY venue-service/package*.json ./
RUN npm ci --omit=dev
COPY venue-service/prisma ./prisma
RUN npx prisma generate
COPY venue-service/src ./src
COPY utils ./utils
CMD ["sh", "-c", "if [ \"$DATA_MODE\" = \"prisma\" ]; then npx prisma migrate deploy; fi; node src/server.js"]
