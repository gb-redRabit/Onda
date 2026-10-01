import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMissingDependencies } from '../useMissingDependencies';
import { depEvents } from '@renderer/utils/depEvents';
import type { DepToolStatus } from '@shared/types/ipc';

function status(over: Partial<DepToolStatus> = {}): DepToolStatus {
  return {
    installed: true,
    version: '7.1',
    path: 'C:/Users/u/AppData/Roaming/onda/bin/ffmpeg.exe',
    managed: true,
    source: 'managed',
    broken: false,
    error: null,
    ...over
  };
}

const missing = status({ installed: false, version: null, path: null, source: null });

function installApi(overrides: Record<string, DepToolStatus> = {}): void {
  (window as unknown as { api: unknown }).api = {
    invoke: vi.fn(async () => true),
    checkFfmpeg: vi.fn(async () => overrides.ffmpeg ?? status()),
    checkFfprobe: vi.fn(async () => overrides.ffprobe ?? status()),
    checkYtdlp: vi.fn(async () => overrides.ytdlp ?? status()),
    checkMkvextract: vi.fn(async () => overrides.mkvextract ?? status())
  };
}

beforeEach(() => {
  installApi();
});

describe('useMissingDependencies', () => {
  it('stays hidden while every dependency resolves', async () => {
    const deps = useMissingDependencies();
    await deps.check();

    expect(deps.issues.value).toEqual([]);
    expect(deps.hasIssues.value).toBe(false);
    expect(deps.visible.value).toBe(false);
  });

  it('surfaces missing dependencies with their names', async () => {
    installApi({ ffmpeg: missing, ffprobe: missing, ytdlp: missing });
    const deps = useMissingDependencies();
    await deps.check();

    expect(deps.issues.value.map((i) => i.name)).toEqual(['FFmpeg', 'FFprobe', 'yt-dlp']);
    expect(deps.issues.value.map((i) => i.required)).toEqual([true, true, false]);
    expect(deps.visible.value).toBe(true);
  });

  it('reports an installed but broken dependency', async () => {
    installApi({ ffmpeg: status({ broken: true, error: 'spawn EACCES' }) });
    const deps = useMissingDependencies();
    await deps.check();

    expect(deps.issues.value).toEqual([
      { tool: 'ffmpeg', name: 'FFmpeg', required: true, broken: true }
    ]);
    expect(deps.visible.value).toBe(true);
  });

  it('treats a failing status check as missing so the user is still warned', async () => {
    (window as unknown as { api: unknown }).api = {
      checkFfmpeg: vi.fn(async () => {
        throw new Error('ipc down');
      }),
      checkFfprobe: vi.fn(async () => status()),
      checkYtdlp: vi.fn(async () => status()),
      checkMkvextract: vi.fn(async () => status())
    };
    const deps = useMissingDependencies();
    await deps.check();

    expect(deps.issues.value.map((i) => i.tool)).toEqual(['ffmpeg']);
  });

  it('hides the banner for the session after dismiss()', async () => {
    installApi({ ffmpeg: missing });
    const deps = useMissingDependencies();
    await deps.check();
    expect(deps.visible.value).toBe(true);

    deps.dismiss();
    expect(deps.visible.value).toBe(false);
    expect(deps.hasIssues.value).toBe(true);

    // Późniejsze ponowne sprawdzenie nie może wskrzesić banera w tej samej sesji.
    await deps.check();
    expect(deps.visible.value).toBe(false);
  });

  it('clears the banner when the missing tool gets installed', async () => {
    installApi({ ffmpeg: missing });
    const deps = useMissingDependencies();
    await deps.check();
    expect(deps.visible.value).toBe(true);

    installApi();
    await deps.check();
    expect(deps.visible.value).toBe(false);
  });

  it('re-checks as soon as an install elsewhere reports a change', async () => {
    installApi({ ffmpeg: missing });
    const deps = useMissingDependencies();
    await deps.check();
    expect(deps.issues.value.map((i) => i.tool)).toEqual(['ffmpeg']);

    // Ustawienia/kreator zakończyły instalację: status jest sondowany tylko w main, więc
    // baner trzeba szturchnąć zamiast czekać na następne uaktywnienie okna.
    installApi();
    depEvents.emit('changed');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deps.visible.value).toBe(false);
    deps.unsubscribe();
  });

  it('forces a real re-probe instead of trusting the cached verdict', async () => {
    installApi({ ffmpeg: missing });
    const api = (window as unknown as { api: { invoke: ReturnType<typeof vi.fn> } }).api;
    const deps = useMissingDependencies();

    await deps.check();

    // Narzędzie może zostać usunięte poza aplikacją; resolver buforuje swój wyrok na
    // proces, więc każde sprawdzenie musi go najpierw unieważnić.
    expect(api.invoke).toHaveBeenCalledWith('dep:recheck');
    deps.unsubscribe();
  });
});
