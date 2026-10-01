import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Każde okno eksploratora miało kiedyś statyczny tytuł BrowserWindow
// "Explorer", więc pasek zadań systemu pokazywał N identycznych wpisów. Renderer musi
// wpisywać nazwę bieżącego folderu do document.title (Electron odzwierciedla ją
// w oknie).

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
