import { handleIpc } from '../typed-handle';
import type { BinTool } from './dependency-utils';
import { resolveBinInfo, invalidateBinaries } from '../../binaries';
import { abortTool, fetchLatestYtdlpVersion } from './dependency-download';
import { ffmpegDownloadUrl } from './dependency-utils';
import {
  installYtdlpManaged,
  installFfmpegManaged,
  installSystem,
  uninstallTool
} from './dependency-install';

// Rejestracja kanałów `dep:*`. Logika instalacji żyje w `dependency-install.ts`
// (zarządzane/systemowe/uninstall), a odczyt wersji i pobieranie — w
// `dependency-utils.ts`/`dependency-download.ts`.

async function checkTool(tool: BinTool): Promise<{
  installed: boolean;
  version: string | null;
  path: string | null;
  managed: boolean;
  source: 'bundled' | 'managed' | 'system' | null;
  broken: boolean;
  error: string | null;
}> {
  const info = await resolveBinInfo(tool);
  if (!info) {
    return {
      installed: false,
      version: null,
      path: null,
      managed: false,
      source: null,
      broken: false,
      error: null
    };
  }
  return {
    installed: true,
    version: info.version,
    path: info.path,
    managed: info.managed,
    source: info.source,
    broken: info.broken,
    error: info.error
  };
}

export function registerDependencyHandlers(): void {
  handleIpc('dep:checkFfmpeg', async () => checkTool('ffmpeg'));
  handleIpc('dep:checkFfprobe', async () => checkTool('ffprobe'));
  handleIpc('dep:checkMkvextract', async () => checkTool('mkvextract'));
  handleIpc('dep:checkYtdlp', async () => checkTool('yt-dlp'));

  // Czyści cache prób na proces, aby następne `dep:check*` naprawdę ponownie uruchomiło
  // binarki. Bez tego narzędzie usunięte poza aplikacją (ręcznie, przez innego menedżera
  // pakietów) było raportowane jako zainstalowane aż do restartu — resolver unieważnia
  // tylko po instalacji/dezinstalacji zainicjowanej stąd.
  handleIpc('dep:recheck', () => {
    invalidateBinaries();
    return true;
  });

  handleIpc(
    'dep:getPaths',
    async (): Promise<
      Array<{
        tool: BinTool;
        path: string | null;
        managed: boolean;
        version: string | null;
        source: 'bundled' | 'managed' | 'system' | null;
        broken: boolean;
        error: string | null;
      }>
    > => {
      // Raport diagnostyczny musi pokazywać bieżący system, a nie zbuforowaną próbę.
      invalidateBinaries();
      const tools: BinTool[] = ['ffmpeg', 'ffprobe', 'yt-dlp', 'mkvextract'];
      const results = await Promise.all(tools.map((t) => resolveBinInfo(t)));
      return tools.map((tool, i) => {
        const info = results[i];
        return {
          tool,
          path: info?.path ?? null,
          managed: info?.managed ?? false,
          version: info?.version ?? null,
          source: info?.source ?? null,
          broken: info?.broken ?? false,
          error: info?.error ?? null
        };
      });
    }
  );

  handleIpc('dep:checkUpdateYtdlp', async () => {
    const latest = await fetchLatestYtdlpVersion();
    const info = await resolveBinInfo('yt-dlp');
    const current = info?.version ?? null;
    const updateAvailable = !!(latest && current && latest !== current);
    return { updateAvailable, current, latest };
  });

  handleIpc('dep:cancelInstall', (_event, tool: string) => {
    abortTool(tool);
    return true;
  });

  handleIpc('dep:installFfmpeg', async (event) => {
    // Zarządzane pobieranie (przypięte + zweryfikowane SHA-256, bez sudo) jest domyślne na
    // każdej platformie, dla której manifest przypina build. Spakowana aplikacja nie
    // dołącza już FFmpeg, więc to główna ścieżka instalacji; systemowi menedżerowie
    // pakietów pozostają fallbackiem tam, gdzie żaden build nie jest przypięty.
    if (ffmpegDownloadUrl()) {
      return installFfmpegManaged(event.sender);
    }
    return installSystem(event.sender, 'ffmpeg');
  });

  handleIpc('dep:installMkvextract', async (event) => installSystem(event.sender, 'mkvextract'));

  handleIpc('dep:installYtdlp', async (event) => installYtdlpManaged(event.sender, false));

  handleIpc('dep:updateYtdlp', async (event) => installYtdlpManaged(event.sender, true));

  handleIpc('dep:removeYtdlp', async (event) => uninstallTool(event.sender, 'yt-dlp'));
  handleIpc('dep:removeFfmpeg', async (event) => uninstallTool(event.sender, 'ffmpeg'));
  handleIpc('dep:removeFfprobe', async (event) => uninstallTool(event.sender, 'ffprobe'));
  handleIpc('dep:removeMkvextract', async (event) => uninstallTool(event.sender, 'mkvextract'));
}
