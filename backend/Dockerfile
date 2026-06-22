FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY src/ ./src/
COPY sql/ ./sql/

ENV NODE_ENV=production

EXPOSE 3001

# --require loads instrumentation BEFORE any application code
CMD ["node", "--require", "./src/instrumentation.js", "src/server.js"]
