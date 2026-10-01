import { runCommand } from '../../utils/exec';
import { resolveBin } from '../../binaries';
import { getYtAuthConfig, cleanupYtAuthTemp } from '../../youtube/youtube-auth';
import { buildYtArgs, type YtDlpEntry } from './youtube-utils';
import { readNetworkArgs } from '../proxy-utils';

// Uruchamia yt-dlp z zastosowanym uwierzytelnianiem i sprząta ewentualny tymczasowy plik
// cookie po zakończeniu. Scentralizowane, aby każdy wywołujący dostawał auth + cleanup spójnie.
export async function runYtDlp(args: string[], timeout: number): Promise<string> {
  const bin = (await resolveBin('yt-dlp')) || 'yt-dlp';
  const auth = await getYtAuthConfig();
  try {
    return await runCommand(bin, buildYtArgs(args, auth), { timeout });
  } finally {
    await cleanupYtAuthTemp(auth);
  }
}

// Uruchamia yt-dlp dla jednego celu i parsuje jego wyjście JSON `-J`. Współdzielone przez
// handlery YouTube i fallback yt-dlp SoundCloud (silnikiem jest yt-dlp,
// więc warstwa spawn/mapowania jest ponownie użyta; różni się tylko logika platformy).
export async function fetchEntryJson(
  target: string,
  mode: 'full' | 'page30',
  scope: 'youtube' | 'generic' = 'youtube'
): Promise<YtDlpEntry> {
  const proxyArgs = await readNetworkArgs(scope);
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
  end: number,
  scope: 'youtube' | 'generic' = 'youtube'
): Promise<YtDlpEntry> {
  const proxyArgs = await readNetworkArgs(scope);
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
