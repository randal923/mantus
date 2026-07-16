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
