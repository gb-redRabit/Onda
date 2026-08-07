import { describe, it, expect } from 'vitest';
import { sanitizeSettings, SETTINGS_ALLOWED_KEYS } from '../settings-schema';

describe('sanitizeSettings', () => {
  it('drops unknown top-level keys (internal store keys, junk)', () => {
    const { sanitized, droppedKeys } = sanitizeSettings({
      libraryFolders: ['C:\\x'],
      coverCacheMap: {},
      nonsense: 1,
      appearance: {}
    });
    expect(droppedKeys).toEqual(expect.arrayContaining(['libraryFolders', 'coverCacheMap', 'nonsense']));
    expect('libraryFolders' in sanitized).toBe(false);
    expect('coverCacheMap' in sanitized).toBe(false);
    expect('nonsense' in sanitized).toBe(false);
  });

  it('rejects non-object input', () => {
    for (const bad of [null, undefined, 42, 'x', [1, 2]]) {
      const { sanitized, droppedKeys } = sanitizeSettings(bad);
      expect(sanitized).toEqual({});
      expect(droppedKeys.length).toBeGreaterThan(0);
    }
  });

  it('validates types and drops invalid fields', () => {
    const { sanitized } = sanitizeSettings({
      appearance: { theme: 'dark', sidebarPosition: 'banana', fontSize: 'big', accentColor: '#fff' },
      favorites: ['a', 1, 'b']
    });
    expect(sanitized.appearance).toEqual({ theme: 'dark', accentColor: '#fff' });
    expect(sanitized.favorites).toEqual(['a', 'b']);
  });

  it('drops unknown enum values', () => {
    const { sanitized } = sanitizeSettings({
      playback: { defaultPlayer: 'html5', pipPosition: 'center', pipWidth: 480, playbackSpeed: 1.25 }
    });
    expect(sanitized.playback).toEqual({ defaultPlayer: 'html5', pipWidth: 480, playbackSpeed: 1.25 });
  });

  it('keeps valid appearance values', () => {
    const { sanitized } = sanitizeSettings({
      appearance: {
        theme: 'midnight',
        locale: 'pl',
        sidebarPosition: 'right',
        audioPipMode: 'wide',
        audioPipPosition: 'bottom-right',
        audioPipEdgePosition: 'bottom',
        transparency: 0.2
      }
    });
    expect(sanitized.appearance).toEqual({
      theme: 'midnight',
      locale: 'pl',
      sidebarPosition: 'right',
      audioPipMode: 'wide',
      audioPipPosition: 'bottom-right',
      audioPipEdgePosition: 'bottom',
      transparency: 0.2
    });
  });

  it('drops corner-only audioPipPosition values that are not corners', () => {
    const { sanitized } = sanitizeSettings({
      appearance: { audioPipPosition: 'top', audioPipEdgePosition: 'top' }
    });
    expect(sanitized.appearance).toEqual({ audioPipEdgePosition: 'top' });
  });

  it('sanitizes apiKeys structure without encrypting', () => {
    const { sanitized } = sanitizeSettings({
      apiKeys: {
        keys: [
          { id: '1', name: 'YT', service: 'youtube', key: 'abc', isActive: true, junk: 5 },
          { id: '2', key: 42 }
        ]
      }
    });
    expect(sanitized.apiKeys).toEqual({
      keys: [{ id: '1', name: 'YT', service: 'youtube', key: 'abc', isActive: true }]
    });
  });

  it('validates nested network.proxy and drops mistyped fields', () => {
    const { sanitized } = sanitizeSettings({
      network: {
        proxy: { enabled: true, type: 'socks5', host: 'h', port: 1080, password: 123 },
        userAgent: 'UA'
      }
    });
    expect(sanitized.network).toEqual({
      proxy: { enabled: true, type: 'socks5', host: 'h', port: 1080 },
      userAgent: 'UA'
    });
  });

  it('sanitizes shortcuts record (only string values)', () => {
    const { sanitized } = sanitizeSettings({
      shortcuts: { 'play-pause': 'Space', 'volume-up': 5 }
    });
    expect(sanitized.shortcuts).toEqual({ 'play-pause': 'Space' });
  });

  it('sanitizes dependencies records and drops invalid entries', () => {
    const { sanitized } = sanitizeSettings({
      dependencies: {
        ffmpeg: { name: 'ffmpeg', installed: true, version: null, checkedAt: 123, path: null },
        broken: 'x'
      }
    });
    expect(sanitized.dependencies).toEqual({
      ffmpeg: { name: 'ffmpeg', installed: true, version: null, checkedAt: 123, path: null }
    });
  });

  it('allows only known AppSettings top-level keys', () => {
    expect(SETTINGS_ALLOWED_KEYS).toEqual(
      expect.arrayContaining([
        'appearance',
        'playback',
        'explorer',
        'library',
        'download',
        'shortcuts',
        'network',
        'apiKeys',
        'updates',
        'toast',
        'dependencies',
        'favorites'
      ])
    );
  });
});
