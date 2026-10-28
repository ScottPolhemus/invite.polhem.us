import path from 'node:path'

import { defineConfig } from 'vitest/config'

const root = __dirname

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}/` },
      // `server-only` throws outside a React Server Components build
      {
        find: 'server-only',
        replacement: path.join(root, 'tests/support/server-only.ts'),
      },
    ],
  },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    globalSetup: ['tests/support/global-setup.ts'],
    setupFiles: ['tests/support/setup.ts'],
    // The specs share one Postgres database, so files run one at a time
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://invite:invite@localhost:5432/invite_test',
      SESSION_SECRET: Buffer.alloc(32, 7).toString('base64'),
      PUBLIC_URL: 'http://127.0.0.1:3000',
      // Lets the app talk to the fake network on localhost (see lib/atproto/identity.ts)
      ALLOW_LOCAL_NETWORK: 'true',
    },
  },
})
