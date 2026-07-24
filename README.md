# Tibia clone

Yarn-workspaces monorepo:

- `client/` — Next.js + PixiJS renderer (sends intents, draws server state)
- `server/` — authoritative Node.js + TS game server (WebSocket, tick loop)
- `protocol/` — zod message schemas shared by both sides

Read `AGENTS.md` (security charter) before writing gameplay code; the roadmap
lives in `plan.md`.

The current load-test results, request/query paths, scaling design,
improvement roadmap, and hardware guidance are in
[`docs/server-capacity.md`](docs/server-capacity.md).

## Run

```bash
yarn                # install all workspaces
yarn db:up          # start Postgres (docker compose)
yarn dev            # client on :3000 + server on :4000, prefixed logs
```

Open http://localhost:3000 in two tabs to see two players walk around.

## Other commands

```bash
yarn typecheck      # all workspaces
yarn test           # server tests (movement validation, etc.)
yarn test:monsters  # 100/300/500/1000 monster browser FPS + combat
yarn test:monsters:cpu # explicit SwiftShader/software-rendering profile
yarn test:monsters:gpu # fails if Chromium falls back to software rendering
yarn test:players   # 100/300/500/1000/2000 WebSocket player capacity
yarn db:down        # stop Postgres
```
