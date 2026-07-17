# Commit Engine backend — container deploy for Render
# (Render sets $PORT automatically; the app already binds to process.env.PORT)
FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
