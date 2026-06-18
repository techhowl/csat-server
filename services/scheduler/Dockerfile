# Production image for the scheduler service.
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY services/worker/package.json services/worker/
COPY services/scheduler/package.json services/scheduler/
RUN npm install
COPY . .
RUN npm run build -w @csat/shared && npm run build -w @csat/scheduler \
  && npm prune --omit=dev

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
USER node
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /app/services/scheduler/package.json ./services/scheduler/package.json
COPY --from=builder --chown=node:node /app/services/scheduler/dist ./services/scheduler/dist
CMD ["node", "services/scheduler/dist/index.js"]
