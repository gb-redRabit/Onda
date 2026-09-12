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
    expect(droppedKeys).toEqual(
      expect.arrayContaining(['libraryFolders', 'coverCacheMap', 'nonsense'])
    );
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
      appearance: {
        theme: 'dark',
        sidebarPosition: 'banana',
        fontSize: 'big',
        glassAlpha: 60
      },
      favorites: ['a', 1, 'b']
    });
    expect(sanitized.appearance).toEqual({ theme: 'dark', glassAlpha: 60 });
    expect(sanitized.favorites).toEqual(['a', 'b']);
  });

  it('sanitizes statusBar and drops unknown section ids', () => {
    const { sanitized } = sanitizeSettings({
      statusBar: {
        visible: true,
        sections: ['playing', 'bogus', 'clock', 42, 'separator'],
        extra: 1
      }
    });
    expect(sanitized.statusBar).toEqual({
      visible: true,
      sections: ['playing', 'clock', 'separator']
    });
  });

  it('migrates legacy accentColor to customColors.primary and drops old fields', () => {
    const { sanitized } = sanitizeSettings({
      appearance: {
        theme: 'custom',
        accentColor: '#8b7cf0',
        transparency: 0.5,
        customBackground: '#0f0f17'
      }
    });
    expect(sanitized.appearance).toEqual({
      theme: 'custom',
      customColors: { primary: '#8b7cf0' }
    });
  });

  it('does not overwrite existing customColors.primary during migration', () => {
    const { sanitized } = sanitizeSettings({
      appearance: {
        accentColor: '#8b7cf0',
        customColors: { primary: '#ff0000', base200: 'nope' }
      }
    });
    expect(sanitized.appearance).toEqual({
      customColors: { primary: '#ff0000' }
    });
  });

  it('sanitizes geometry clamps and drops out-of-range values', () => {
    const { sanitized } = sanitizeSettings({
      appearance: {
        geometry: { radiusBox: 99, radiusField: -3, border: 2, depth: 1, noise: 5, sizeField: 4 }
      }
    });
    expect(sanitized.appearance).toEqual({
      geometry: { radiusBox: 32, radiusField: 0, border: 2, depth: 1, sizeField: 4 }
    });
  });

  it('drops invalid hex values from customColors', () => {
    const { sanitized } = sanitizeSettings({
      appearance: { customColors: { primary: '#GG0000', accent: 'red', info: '#0af' } }
    });
    expect(sanitized.appearance).toEqual({ customColors: { info: '#0af' } });
  });

  it('drops unknown enum values', () => {
    const { sanitized } = sanitizeSettings({
      playback: {
        defaultPlayer: 'html5',
        pipPosition: 'center',
        pipWidth: 480,
        playbackSpeed: 1.25
      }
    });
    expect(sanitized.playback).toEqual({
      defaultPlayer: 'html5',
      pipWidth: 480,
      playbackSpeed: 1.25
    });
  });

  it('keeps valid appearance values', () => {
    const { sanitized } = sanitizeSettings({
      appearance: {
        theme: 'midnight',
        locale: 'pl',
        sidebarPosition: 'right',
        audioPipDock: 'bottom',
        audioPipCornerElements: ['cover', 'controls'],
        audioPipEdgeElements: ['cover', 'controls', 'viz'],
        audioPipAutoHide: false
      }
    });
    expect(sanitized.appearance).toEqual({
      theme: 'midnight',
      locale: 'pl',
      sidebarPosition: 'right',
      audioPipDock: 'bottom',
      audioPipCornerElements: ['cover', 'controls'],
      audioPipEdgeElements: ['cover', 'controls', 'viz'],
      audioPipAutoHide: false
    });
  });

  it('migrates legacy pip mode to dock', () => {
    const { sanitized } = sanitizeSettings({
      appearance: { audioPipMode: 'wide', audioPipEdgePosition: 'bottom' }
    });
    expect(sanitized.appearance).toMatchObject({ audioPipDock: 'bottom' });
  });

  it('drops corner-only audioPipPosition values that are not corners', () => {
    const { sanitized } = sanitizeSettings({
      appearance: { audioPipPosition: 'top', audioPipEdgePosition: 'top' }
    });
    expect(sanitized.appearance).toMatchObject({ audioPipEdgePosition: 'top' });
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

  it('sanitizes youtube auth settings and drops invalid method values', () => {
    const { sanitized } = sanitizeSettings({
      youtube: {
        method: 'electron',
        cookiesPath: 'C:\\x\\youtube-cookies.txt',
        cookiesBrowser: 'firefox',
        lastLogin: 1234567890,
        junk: true
      }
    });
    expect(sanitized.youtube).toEqual({
      method: 'electron',
      cookiesPath: 'C:\\x\\youtube-cookies.txt',
      cookiesBrowser: 'firefox',
      lastLogin: 1234567890
    });

    const { sanitized: bad } = sanitizeSettings({ youtube: { method: 'hacked' } });
    expect(bad.youtube).toEqual({});
  });

  it('sanitizes audioLayout element bg fields, accepts known variant and drops junk', () => {
    const { sanitized } = sanitizeSettings({
      appearance: {
        audioLayout: {
          elements: [
            {
              id: 'cover',
              x: 1,
              y: 1,
              width: 2,
              height: 2,
              opacity: 50,
              layer: 2,
              visible: true,
              bg: true,
              bgOpacity: 40,
              variant: 'rounded',
              junk: 1
            },
            {
              id: 'progress',
              x: 0,
              y: 0,
              width: 50,
              height: 5,
              opacity: 100,
              layer: 3,
              visible: true,
              variant: 'hacked'
            }
          ],
          autoHideDelay: 3000
        }
      }
    });
    expect(sanitized.appearance?.audioLayout).toEqual({
      elements: [
        {
          id: 'cover',
          x: 1,
          y: 1,
          width: 2,
          height: 2,
          opacity: 50,
          layer: 2,
          visible: true,
          bg: true,
          bgOpacity: 40,
          variant: 'rounded'
        },
        { id: 'progress', x: 0, y: 0, width: 50, height: 5, opacity: 100, layer: 3, visible: true }
      ]
    });
  });

  it('clamps legacy cursorTimeout to the seconds range and keeps valid seconds value', () => {
    const { sanitized: clamps } = sanitizeSettings({ playback: { cursorTimeout: 500 } });
    expect(clamps.playback).toEqual({ cursorTimeout: 30 });

    const { sanitized: ok } = sanitizeSettings({
      playback: { cursorTimeout: 3, cursorHide: true }
    });
    expect(ok.playback).toEqual({ cursorTimeout: 3, cursorHide: true });
  });

  it('keeps resumePromptTimeout in seconds and clamps to the allowed range', () => {
    const { sanitized: ok } = sanitizeSettings({ playback: { resumePromptTimeout: 9 } });
    expect(ok.playback).toEqual({ resumePromptTimeout: 9 });

    const { sanitized: clamped } = sanitizeSettings({ playback: { resumePromptTimeout: 999 } });
    expect(clamped.playback).toEqual({ resumePromptTimeout: 60 });
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
        'youtube',
        'updates',
        'toast',
        'dependencies',
        'favorites'
      ])
    );
  });
});
