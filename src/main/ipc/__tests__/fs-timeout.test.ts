import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// readdir/stat na martwym udziale sieciowym zawieszał Explorer na zawsze.

const SRC = readFileSync(join(process.cwd(), 'src/main/ipc/fs/fs-handlers.ts'), 'utf8');

describe('fs handler timeouts', () => {
  it('bounds readdir and stat with withTimeout', () => {
    expect(SRC).toMatch(/withTimeout\(readdir/);
    expect(SRC).toMatch(/withTimeout\(stat/);
  });
});
