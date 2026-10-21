FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
CMD ["sh", "-c", "if [ \"$DATA_MODE\" = \"prisma\" ]; then npx prisma migrate deploy; fi; node src/server.js"]
