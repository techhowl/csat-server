# Production image for the API service (pipeline: docker build per service).
# Multi-stage: compile the whole workspace, then ship only prod deps + dist.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/http/package.json packages/http/
COPY services/api/package.json services/api/
COPY services/worker/package.json services/worker/
COPY services/scheduler/package.json services/scheduler/
RUN npm install
COPY . .
RUN npm run build -w @csat/shared && npm run build -w @csat/http \
  && npm run build -w @csat/api \
  && npm prune --omit=dev

FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV INFISICAL_ENV=prod
ENV INFISICAL_PROJECT_ID=614c0077-6657-4956-bcdb-be85c86131c8
WORKDIR /app
# Infisical CLI — installed as root before dropping privileges. `infisical run`
# fetches secrets at boot using INFISICAL_TOKEN + INFISICAL_API_URL (passed at runtime).
RUN apk add --no-cache bash curl \
 && curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash \
 && apk add --no-cache infisical
# Run as the built-in unprivileged user.
USER node
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /app/packages/http/package.json ./packages/http/package.json
COPY --from=builder --chown=node:node /app/packages/http/dist ./packages/http/dist
COPY --from=builder --chown=node:node /app/services/api/package.json ./services/api/package.json
COPY --from=builder --chown=node:node /app/services/api/dist ./services/api/dist
EXPOSE 4000
CMD infisical run --projectId "$INFISICAL_PROJECT_ID" --env "$INFISICAL_ENV" -- node services/api/dist/index.js
