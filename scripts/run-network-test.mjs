// Uruchamia opcjonalny test sieciowy smoke.
// Użycie:
//   npm run test:network                     (generic-stream-network)
//   npm run test:network:online              (online-network-smoke: YT/SC)
//   node scripts/run-network-test.mjs <plik.test.ts> [...środowisko]
// Opcjonalne zmienne środowiskowe są przekazywane do testu:
//   ONDA_YTDLP     - bezwzględna ścieżka do binarki yt-dlp
//   ONDA_BIN_DIR   - katalog zawierający yt-dlp (np. folder userData/bin aplikacji)
//   ONDA_TEST_URLS - oddzielone przecinkami URL-e stron do przetestowania zamiast domyślnych
import { spawn } from 'node:child_process';

const target = process.argv[2] || 'src/main/__tests__/generic-stream-network.test.ts';

const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', target], {
  stdio: 'inherit',
  env: { ...process.env, ONDA_NETWORK_TESTS: '1' }
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
