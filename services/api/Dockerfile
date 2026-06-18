# Production image for the API service (pipeline: docker build per service).
# Multi-stage: compile the whole workspace, then ship only prod deps + dist.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
COPY services/worker/package.json services/worker/
COPY services/scheduler/package.json services/scheduler/
RUN npm install
COPY . .
RUN npm run build -w @csat/shared && npm run build -w @csat/api \
  && npm prune --omit=dev

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
# Run as the built-in unprivileged user.
USER node
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /app/services/api/package.json ./services/api/package.json
COPY --from=builder --chown=node:node /app/services/api/dist ./services/api/dist
EXPOSE 4000
CMD ["node", "services/api/dist/index.js"]
