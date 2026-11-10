import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handles: new Map<string, (...args: any[]) => any>(),
  listeners: new Map<string, (...args: any[]) => any>(),
  configureDiscord: vi.fn(),
  getDiscordStatus: vi.fn(() => ({ connected: true })),
  updatePresence: vi.fn(),
  normalizeCoverQuery: vi.fn((query: unknown) => (query ? `normalized:${query}` : null)),
  resolveCoverUrl: vi.fn(async (query: string) => `cover:${query}`),
  resolveLocalCover: vi.fn(async (path: unknown) => (path ? `local:${path}` : null))
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      h.handles.set(channel, handler);
    },
    on: (channel: string, handler: (...args: any[]) => any) => {
      h.listeners.set(channel, handler);
    }
  }
}));
vi.mock('../rich-presence', () => ({
  configureDiscord: h.configureDiscord,
  getDiscordStatus: h.getDiscordStatus,
  updatePresence: h.updatePresence
}));
vi.mock('../cover-lookup', () => ({
  normalizeCoverQuery: h.normalizeCoverQuery,
  resolveCoverUrl: h.resolveCoverUrl
}));
vi.mock('../cover-upload', () => ({ resolveLocalCover: h.resolveLocalCover }));

import { registerDiscordHandlers, sanitizePresence } from '../discord-handlers';

const event = { sender: {} };

function call(channel: string, ...args: unknown[]) {
  return h.handles.get(channel)!(event, ...args);
}

beforeEach(() => {
  h.handles.clear();
  h.listeners.clear();
  h.configureDiscord.mockReset();
  h.getDiscordStatus.mockClear();
  h.updatePresence.mockReset();
  h.normalizeCoverQuery.mockClear();
  h.resolveCoverUrl.mockReset();
  h.resolveCoverUrl.mockImplementation(async (query: string) => `cover:${query}`);
  h.resolveLocalCover.mockReset();
  h.resolveLocalCover.mockImplementation(async (path: unknown) => (path ? `local:${path}` : null));
  registerDiscordHandlers();
});

describe('sanitizePresence', () => {
  it('rejects non-object payloads', () => {
    for (const value of [null, undefined, 'state', 42, []]) {
      expect(sanitizePresence(value)).toBeNull();
    }
  });

  it('applies defaults and boolean coercion', () => {
    expect(sanitizePresence({})).toEqual({
      title: 'Unknown',
      kind: 'audio',
      isPlaying: false
    });
    expect(sanitizePresence({ title: '  Song  ', kind: 'video', isPlaying: 'yes' })).toEqual({
      title: 'Song',
      kind: 'video',
      isPlaying: false
    });
    expect(sanitizePresence({ kind: 'stream', isPlaying: true })).toMatchObject({
      kind: 'stream',
      isPlaying: true
    });
  });

  it('falls back to audio for unknown kinds', () => {
    expect(sanitizePresence({ kind: 'movie' })).toMatchObject({ kind: 'audio' });
  });

  it('trims optional text and truncates long titles', () => {
    const title = 'x'.repeat(300);
    const state = sanitizePresence({
      title,
      artist: '  Artist  ',
      album: '  Album  '
    });

    expect(state?.title).toHaveLength(256);
    expect(state?.artist).toBe('Artist');
    expect(state?.album).toBe('Album');
    expect(sanitizePresence({ album: '   ' })?.album).toBeUndefined();
  });

  it('accepts only http(s) cover URLs', () => {
    expect(sanitizePresence({ coverUrl: 'https://img/a.jpg' })?.coverUrl).toBe('https://img/a.jpg');
    expect(sanitizePresence({ coverUrl: 'http://img/a.jpg' })?.coverUrl).toBe('http://img/a.jpg');
    expect(sanitizePresence({ coverUrl: 'file:///a.jpg' })?.coverUrl).toBeUndefined();
    expect(sanitizePresence({ coverUrl: 'javascript:alert(1)' })?.coverUrl).toBeUndefined();
  });

  it('keeps non-negative finite positions only', () => {
    expect(sanitizePresence({ positionSec: 0, durationSec: 12.5 })).toMatchObject({
      positionSec: 0,
      durationSec: 12.5
    });
    expect(sanitizePresence({ positionSec: -1, durationSec: Infinity })).toEqual({
      title: 'Unknown',
      kind: 'audio',
      isPlaying: false
    });
    expect(sanitizePresence({ positionSec: '12' })).not.toHaveProperty('positionSec');
  });
});

describe('registration', () => {
  it('registers every channel', () => {
    expect([...h.handles.keys()]).toEqual([
      'discord:configure',
      'discord:getStatus',
      'discord:resolveCover',
      'discord:resolveLocalCover'
    ]);
    expect([...h.listeners.keys()]).toEqual(['discord:update']);
  });

  it('delegates configuration and status', async () => {
    await expect(call('discord:configure', { enabled: true })).resolves.toBeUndefined();
    expect(h.configureDiscord).toHaveBeenCalledWith({ enabled: true });

    expect(call('discord:getStatus')).toEqual({ connected: true });
  });

  it('normalizes cover queries before resolving', async () => {
    await expect(call('discord:resolveCover', 'Artist - Song')).resolves.toBe(
      'cover:normalized:Artist - Song'
    );
    expect(h.normalizeCoverQuery).toHaveBeenCalledWith('Artist - Song');

    await expect(call('discord:resolveCover', '')).resolves.toBeNull();
    expect(h.resolveCoverUrl).toHaveBeenCalledTimes(1);
  });

  it('delegates local cover resolution', async () => {
    await expect(call('discord:resolveLocalCover', 'D:/cover.jpg')).resolves.toBe(
      'local:D:/cover.jpg'
    );
    expect(h.resolveLocalCover).toHaveBeenCalledWith('D:/cover.jpg');
  });

  it('sanitizes presence updates', () => {
    h.listeners.get('discord:update')!(event, {
      title: ' Song ',
      kind: 'video',
      isPlaying: true
    });

    expect(h.updatePresence).toHaveBeenCalledWith({
      title: 'Song',
      kind: 'video',
      isPlaying: true
    });

    h.listeners.get('discord:update')!(event, null);
    expect(h.updatePresence).toHaveBeenLastCalledWith(null);
  });
});
