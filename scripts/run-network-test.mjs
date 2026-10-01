// Uruchamia opcjonalny test sieciowy smoke (src/main/__tests__/generic-stream-network.test.ts).
// Użycie: npm run test:network
// Opcjonalne zmienne środowiskowe są przekazywane do testu:
//   ONDA_YTDLP     - bezwzględna ścieżka do binarki yt-dlp
//   ONDA_BIN_DIR   - katalog zawierający yt-dlp (np. folder userData/bin aplikacji)
//   ONDA_TEST_URLS - oddzielone przecinkami URL-e stron do przetestowania zamiast domyślnych
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
