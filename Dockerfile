# ---- Base image ----
FROM node:20-alpine AS base

# ---- App directory ----
WORKDIR /app

# ---- Install dependencies first (better cache) ----
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Copy app source ----
COPY . .

# ---- Environment ----
ENV NODE_ENV=production
ENV PORT=3000

# ---- Expose port ----
EXPOSE 3000

# ---- Start app ----
CMD ["node", "server.js"]
