import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  session: { fromPartition: vi.fn() },
  app: { on: vi.fn() }
}));

import { previewUserAgent, PREVIEW_PARTITION } from '../preview-session';

describe('previewUserAgent', () => {
  it('looks like desktop Chrome and never exposes Electron', () => {
    const ua = previewUserAgent();
    expect(ua).toContain('Chrome/');
    expect(ua).toMatch(/Mozilla\/5\.0/);
    expect(ua).not.toContain('Electron');
  });
});

describe('PREVIEW_PARTITION', () => {
  it('is a namespaced persistent partition', () => {
    expect(PREVIEW_PARTITION).toBe('persist:onda-preview');
  });
});
