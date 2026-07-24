/// <reference types="@vitest/browser/providers/playwright" />

interface ImportMetaEnv {
  readonly VITE_CLIENT_RENDERER_PROFILE?: string;
  readonly VITE_PLAYTEST_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
