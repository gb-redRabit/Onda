// Runs the opt-in network smoke test (src/main/__tests__/generic-stream-network.test.ts).
// Usage: npm run test:network
// Optional environment variables are forwarded to the test:
//   ONDA_YTDLP     - absolute path to a yt-dlp binary
//   ONDA_BIN_DIR   - directory containing yt-dlp (e.g. the app userData/bin folder)
//   ONDA_TEST_URLS - comma separated page URLs to test instead of the defaults
import { spawn } from 'node:child_process';

const child = spawn(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'src/main/__tests__/generic-stream-network.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, ONDA_NETWORK_TESTS: '1' }
  }
);

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
