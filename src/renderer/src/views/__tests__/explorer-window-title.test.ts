import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every explorer window used to carry the static BrowserWindow title
// "Explorer", so the OS taskbar showed N identical entries. The renderer has to
// push the current folder's name into document.title (Electron mirrors it onto
// the window).

const VIEW = join(process.cwd(), 'src/renderer/src/views/ExplorerWindowView.vue');
const source = readFileSync(VIEW, 'utf8');

describe('explorer window title', () => {
  it('writes the current folder name to document.title', () => {
    expect(source).toMatch(/document\.title\s*=/);
    expect(source).toMatch(/currentPath/);
  });

  it('derives the folder name with the shared basename helper', () => {
    expect(source).toMatch(/explorerWindowTitle/);
  });
});
