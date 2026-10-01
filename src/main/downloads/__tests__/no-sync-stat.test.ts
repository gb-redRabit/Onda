import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// `statSync` on the download path blocked the Node event loop (all IPC) while a
// download finished. The output resolution must use the async `stat`.

const SOURCE = readFileSync(join(process.cwd(), 'src/main/downloads/download-attempt.ts'), 'utf8');

describe('download output resolution', () => {
  it('does not use the synchronous statSync', () => {
    expect(SOURCE).not.toMatch(/statSync\(/);
    expect(SOURCE).toMatch(/from 'fs\/promises'/);
  });
});
