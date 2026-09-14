import { runCommand } from '../utils/exec';
import { resolveBin } from '../binaries';
import { getYtAuthConfig, cleanupYtAuthTemp } from '../youtube-auth';
import { buildYtArgs, type YtDlpEntry } from './youtube-utils';
import { readProxyArgs } from './proxy-utils';

// Runs yt-dlp with authentication applied and cleans up any temporary cookie
// file afterwards. Centralized so every caller gets auth + cleanup consistently.
export async function runYtDlp(args: string[], timeout: number): Promise<string> {
  const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
  const auth = await getYtAuthConfig();
  try {
    return await runCommand(bin, buildYtArgs(args, auth), { timeout });
  } finally {
    await cleanupYtAuthTemp(auth);
  }
}

// Spawns yt-dlp for one target and parses its `-J` JSON output. Shared by the
// YouTube handlers and the SoundCloud yt-dlp fallback (the engine is yt-dlp,
// so the spawn/mapping layer is reused; only the platform logic differs).
export async function fetchEntryJson(target: string, mode: 'full' | 'page30'): Promise<YtDlpEntry> {
  const proxyArgs = await readProxyArgs();
  const args =
    mode === 'full'
      ? [target, '--no-warnings', '-J', ...proxyArgs]
      : [
          target,
          '--flat-playlist',
          '--playlist-start',
          '1',
          '--playlist-end',
          '30',
          '--no-warnings',
          '-J',
          ...proxyArgs
        ];
  return JSON.parse(await runYtDlp(args, 60000)) as YtDlpEntry;
}

export async function fetchRangeJson(
  target: string,
  start: number,
  end: number
): Promise<YtDlpEntry> {
  const proxyArgs = await readProxyArgs();
  return JSON.parse(
    await runYtDlp(
      [
        target,
        '--flat-playlist',
        '--playlist-start',
        String(start),
        '--playlist-end',
        String(end),
        '--no-warnings',
        '-J',
        ...proxyArgs
      ],
      60000
    )
  ) as YtDlpEntry;
}
