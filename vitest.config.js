import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// A throwaway DB path for the test run. Set here (not in the test file) so it is
// in process.env BEFORE config/config.js + database.js read it at module load.
const TEST_DB = path.join(os.tmpdir(), 'gitlogs-vitest.db');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // The backend uses module-level singletons (sql.js DB, the queue interval).
    // Run in a single fork, files serially, so suites don't clobber shared state.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    // dotenv in config.js does NOT override already-set vars, so these win over
    // the committed .env — tests never touch real secrets or live services.
    env: {
      NODE_ENV: 'test',
      WEBHOOK_SECRET: 'test-webhook-secret-e2e',
      ALLOWED_REPOS: 'octo-dev/payments-api',
      ENABLE_THREADING: 'true',
      DATABASE_PATH: TEST_DB,
      GEMINI_API_KEY: 'test-key-not-used',
    },
  },
});
