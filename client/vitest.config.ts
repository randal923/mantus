import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const rendererProfile =
  process.env.VITE_CLIENT_RENDERER_PROFILE ??
  process.env.CLIENT_RENDERER_PROFILE ??
  'software';
const chromiumArgs =
  rendererProfile === 'hardware'
    ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface']
    : [];

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  test: {
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['lib/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: {
            'next/image': path.join(dirname, 'e2e/nextImageStub.tsx'),
            'next/link': path.join(dirname, 'e2e/nextLinkStub.tsx'),
          },
        },
        test: {
          name: 'e2e',
          include: ['e2e/**/*.e2e.test.tsx'],
          globalSetup: ['e2e/globalSetup.ts'],
          setupFiles: ['e2e/setup.ts'],
          testTimeout: 300_000,
          hookTimeout: 120_000,
          browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            instances: [{ browser: 'chromium', launch: { args: chromiumArgs } }],
          },
        },
      },
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({ configDir: path.join(dirname, '.storybook') }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
