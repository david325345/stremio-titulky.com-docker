FROM node:20-alpine

WORKDIR /app

# Increase Node memory for npm install on low-RAM servers
ENV NODE_OPTIONS="--max-old-space-size=512"

COPY package*.json ./
RUN npm install --omit=dev --no-optional

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
