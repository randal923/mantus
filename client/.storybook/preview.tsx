import type { Preview } from '@storybook/nextjs-vite'
import { Cinzel, Geist } from 'next/font/google'

import '../app/globals.css'
import '../i18n/i18n'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const cinzel = Cinzel({
  variable: '--font-cinzel',
  subsets: ['latin'],
})

const preview: Preview = {
  decorators: [
    (Story) => (
      <div
        className={`${geistSans.variable} ${cinzel.variable} contents`}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
};

export default preview;
