import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useLibrarySelectionStore } from '../library-selection';
import type { MediaFile } from '@renderer/types/media';

function track(path: string): MediaFile {
  return { path, name: path, type: 'audio' } as MediaFile;
}

const list = [track('/a.mp3'), track('/b.mp3'), track('/c.mp3'), track('/d.mp3')];

describe('library selection store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('replaces the selection and toggles individual tracks', () => {
    const s = useLibrarySelectionStore();
    s.replaceWith('/a.mp3');
    expect(s.count).toBe(1);
    expect(s.has('/a.mp3')).toBe(true);

    s.toggle('/b.mp3');
    expect(s.count).toBe(2);

    s.toggle('/a.mp3');
    expect(s.count).toBe(1);
    expect(s.has('/a.mp3')).toBe(false);
  });

  it('add and remove are idempotent (used from the context menu)', () => {
    const s = useLibrarySelectionStore();
    s.replaceWith('/a.mp3');
    s.add('/a.mp3');
    expect(s.count).toBe(1);
    s.add('/b.mp3');
    expect(s.count).toBe(2);
    s.remove('/b.mp3');
    s.remove('/b.mp3');
    expect(s.count).toBe(1);
  });

  it('selects a range from the anchor', () => {
    const s = useLibrarySelectionStore();
    s.replaceWith('/a.mp3');
    s.selectRange(list, '/c.mp3');
    expect(s.paths.sort()).toEqual(['/a.mp3', '/b.mp3', '/c.mp3']);

    // Zakres od nowego punktu zaczepienia nie kasuje wcześniejszych.
    s.toggle('/d.mp3');
    s.replaceWith('/d.mp3');
    s.selectRange(list, '/b.mp3');
    expect(s.has('/b.mp3')).toBe(true);
    expect(s.has('/d.mp3')).toBe(true);
  });

  it('clear resets selection and anchor', () => {
    const s = useLibrarySelectionStore();
    s.replaceWith('/a.mp3');
    s.clear();
    expect(s.count).toBe(0);
    expect(s.anchorPath).toBeNull();
  });
});
