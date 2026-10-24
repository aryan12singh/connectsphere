FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY attendance-service/package*.json ./
RUN npm ci --omit=dev
COPY attendance-service/prisma ./prisma
RUN npx prisma generate
COPY attendance-service/src ./src
COPY utils ./utils
ENV SERVICE_UTILS_PATH=/app/utils
CMD ["sh", "-c", "if [ \"$DATA_MODE\" = \"prisma\" ]; then npx prisma migrate deploy; fi; node src/server.js"]
