FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Více paměti jen pro instalaci balíčků (na slabých serverech), ne za běhu
COPY package.json package-lock.json ./
RUN NODE_OPTIONS="--max-old-space-size=512" npm ci --omit=dev \
 && npm cache clean --force

COPY . .

# Neběžet jako root
USER node

EXPOSE 3007

CMD ["node", "server.js"]
