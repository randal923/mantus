<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tibia assets

`public/assets/` holds sprites/metadata ripped from Tibia.dat/.spr. Before
working with them, read `ASSETS.md` — it documents the atlas format, sprite
ordering, pattern/layer quirks, and a table of visually-verified client IDs.
Use `node tools/spritetool.mjs` to render/inspect sprites instead of
re-deriving IDs from raw data.
