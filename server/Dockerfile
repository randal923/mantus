# Game server image. Build with the REPO ROOT as context (see fly.toml):
# the server workspace consumes @tibia/protocol as TypeScript source (tsx
# runtime), so both workspaces and the root manifest must be present.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Manifests first so dependency install stays cached across source changes.
COPY package.json yarn.lock ./
COPY server/package.json server/
COPY protocol/package.json protocol/
RUN yarn install --frozen-lockfile --production && yarn cache clean

COPY protocol protocol
COPY server server

EXPOSE 4000
CMD ["yarn", "workspace", "server", "start"]
