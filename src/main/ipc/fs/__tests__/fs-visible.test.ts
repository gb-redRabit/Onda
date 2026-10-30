import { describe, expect, it } from 'vitest';
import { visibleEntries } from '../fs-visible';

const entry = (name: string) => ({ name });

describe('visibleEntries', () => {
  it('hides dotfiles and Windows system entries by default', () => {
    const names = visibleEntries(
      [
        entry('Music'),
        entry('.git'),
        entry('$RECYCLE.BIN'),
        entry('System Volume Information'),
        entry('desktop.ini')
      ],
      false
    ).map((e) => e.name);
    expect(names).toEqual(['Music']);
  });

  it('shows everything when hidden files are requested', () => {
    const names = visibleEntries([entry('Music'), entry('.git')], true).map((e) => e.name);
    expect(names).toEqual(['Music', '.git']);
  });
});
