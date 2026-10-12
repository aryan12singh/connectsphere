FROM node:22-alpine
WORKDIR /app

# Prisma's migrate tool needs OpenSSL, which the Alpine image leaves out.
RUN apk add --no-cache openssl

# Install exact versions from package-lock.json (npm ci), so every
# teammate and every build gets the same dependencies. Done first so Docker
# can cache this layer.
COPY event-service/package*.json ./
RUN npm ci --omit=dev

# Generate the Prisma client from the schema.
COPY event-service/prisma ./prisma
RUN npx prisma generate

COPY event-service/src ./src
COPY utils ./utils

# Apply any pending migrations, then start. `migrate deploy` only runs
# migrations already committed in prisma/migrations — it never creates new ones.
CMD ["sh", "-c", "if [ \"$DATA_MODE\" = \"prisma\" ]; then npx prisma migrate deploy; fi; node src/server.js"]
