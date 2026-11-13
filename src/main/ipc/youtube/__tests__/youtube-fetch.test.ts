import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  runCommand: vi.fn(),
  resolveBin: vi.fn(),
  getYtAuthConfig: vi.fn(),
  cleanupYtAuthTemp: vi.fn(),
  buildYtArgs: vi.fn((args: string[], auth: unknown) => (auth ? [...args, '--auth'] : [...args])),
  readNetworkArgs: vi.fn(async () => ['--proxy', 'p'])
}));

vi.mock('../../../utils/exec', () => ({ runCommand: h.runCommand }));
vi.mock('../../../binaries', () => ({ resolveBin: h.resolveBin }));
vi.mock('../../../youtube/youtube-auth', () => ({
  getYtAuthConfig: h.getYtAuthConfig,
  cleanupYtAuthTemp: h.cleanupYtAuthTemp
}));
vi.mock('../youtube-utils', () => ({ buildYtArgs: h.buildYtArgs }));
vi.mock('../../proxy-utils', () => ({ readNetworkArgs: h.readNetworkArgs }));

import { fetchEntryJson, fetchRangeJson, runYtDlp } from '../youtube-fetch';

beforeEach(() => {
  h.runCommand.mockReset().mockResolvedValue('stdout');
  h.resolveBin.mockReset().mockResolvedValue('/bin/yt-dlp');
  h.getYtAuthConfig.mockReset().mockResolvedValue({ cookies: 'c' });
  h.cleanupYtAuthTemp.mockReset().mockResolvedValue(undefined);
  h.buildYtArgs.mockClear();
  h.readNetworkArgs.mockReset().mockResolvedValue(['--proxy', 'p']);
});

describe('runYtDlp', () => {
  it('resolves the binary, applies auth and cleans up', async () => {
    const result = await runYtDlp(['url'], 5000);

    expect(h.resolveBin).toHaveBeenCalledWith('yt-dlp');
    expect(h.buildYtArgs).toHaveBeenCalledWith(['url'], { cookies: 'c' });
    expect(h.runCommand).toHaveBeenCalledWith('/bin/yt-dlp', ['url', '--auth'], { timeout: 5000 });
    expect(h.cleanupYtAuthTemp).toHaveBeenCalledWith({ cookies: 'c' });
    expect(result).toBe('stdout');
  });

  it('falls back to the yt-dlp command name', async () => {
    h.resolveBin.mockResolvedValue(null);

    await runYtDlp([], 1);

    expect(h.runCommand).toHaveBeenCalledWith('yt-dlp', ['--auth'], { timeout: 1 });
  });

  it('cleans up even when the command fails', async () => {
    const error = new Error('spawn failed');
    h.runCommand.mockRejectedValue(error);

    await expect(runYtDlp(['url'], 10)).rejects.toBe(error);
    expect(h.cleanupYtAuthTemp).toHaveBeenCalledWith({ cookies: 'c' });
  });
});

describe('fetchEntryJson', () => {
  it('requests a full entry with the default scope', async () => {
    h.runCommand.mockResolvedValue('{"id":"a"}');

    const result = await fetchEntryJson('https://yt/x', 'full');

    expect(h.readNetworkArgs).toHaveBeenCalledWith('youtube');
    expect(h.runCommand).toHaveBeenCalledWith(
      '/bin/yt-dlp',
      ['https://yt/x', '--no-warnings', '-J', '--proxy', 'p', '--auth'],
      { timeout: 60000 }
    );
    expect(result).toEqual({ id: 'a' });
  });

  it('requests the first thirty items for page30 and honours the scope', async () => {
    h.runCommand.mockResolvedValue('{}');

    await fetchEntryJson('https://sc/x', 'page30', 'generic');

    expect(h.readNetworkArgs).toHaveBeenCalledWith('generic');
    expect(h.runCommand).toHaveBeenCalledWith(
      '/bin/yt-dlp',
      [
        'https://sc/x',
        '--flat-playlist',
        '--playlist-start',
        '1',
        '--playlist-end',
        '30',
        '--no-warnings',
        '-J',
        '--proxy',
        'p',
        '--auth'
      ],
      { timeout: 60000 }
    );
  });
});

describe('fetchRangeJson', () => {
  it('requests an explicit playlist range', async () => {
    h.runCommand.mockResolvedValue('{"entries":[]}');

    const result = await fetchRangeJson('t', 3, 9, 'generic');

    expect(h.readNetworkArgs).toHaveBeenCalledWith('generic');
    expect(h.runCommand).toHaveBeenCalledWith(
      '/bin/yt-dlp',
      [
        't',
        '--flat-playlist',
        '--playlist-start',
        '3',
        '--playlist-end',
        '9',
        '--no-warnings',
        '-J',
        '--proxy',
        'p',
        '--auth'
      ],
      { timeout: 60000 }
    );
    expect(result).toEqual({ entries: [] });
  });
});
