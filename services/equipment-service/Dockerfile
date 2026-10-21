FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY equipment-service/package*.json ./
RUN npm ci --omit=dev
COPY equipment-service/prisma ./prisma
RUN npx prisma generate
COPY equipment-service/src ./src
COPY utils ./utils
CMD ["sh", "-c", "if [ \"$DATA_MODE\" = \"prisma\" ]; then npx prisma migrate deploy; fi; node src/server.js"]
