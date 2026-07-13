# Tibia clone

Yarn-workspaces monorepo:

- `client/` — Next.js + PixiJS renderer (sends intents, draws server state)
- `server/` — authoritative Node.js + TS game server (WebSocket, tick loop)
- `protocol/` — zod message schemas shared by both sides

Read `AGENTS.md` (security charter) before writing gameplay code; the roadmap
lives in `plan.md`.

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
yarn db:down        # stop Postgres
```
