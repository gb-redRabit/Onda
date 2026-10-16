import { beforeEach, describe, expect, it, vi } from 'vitest';

// Prompt wznowienia: start timera także dla promptu ustawionego PRZED montażem
// (immediate), pauza/wznowienie odliczania i akcje continue/start. Store'y mockowane
// jako reaktywne obiekty, żeby `watch` działał bez okablowania IPC.

const h = vi.hoisted(() => ({
  player: null as unknown,
  settings: null as unknown
}));

vi.mock('@renderer/stores/player', async () => {
  const { reactive } = await import('vue');
  const player = reactive({
    resumePrompt: null as { path: string; position: number } | null,
    clearResumePrompt() {
      player.resumePrompt = null;
    }
  });
  h.player = player;
  return { usePlayerStore: () => player };
});

vi.mock('@renderer/stores/settings', async () => {
  const { reactive } = await import('vue');
  const settings = reactive({ playback: { resumePromptTimeout: 7 } });
  h.settings = settings;
  return { useSettingsStore: () => settings };
});

const { useResumePrompt } = await import('../useResumePrompt');
const { effectScope, nextTick } = await import('vue');

interface PlayerState {
  resumePrompt: { path: string; position: number } | null;
  clearResumePrompt: () => void;
}
const player = h.player as PlayerState;
const settings = h.settings as { playback: { resumePromptTimeout: number } };

function mount(handlers: {
  onContinue: (p: { path: string; position: number }) => void;
  onStart?: (p: { path: string; position: number }) => void;
}) {
  const scope = effectScope(true);
  let api: ReturnType<typeof useResumePrompt> | undefined;
  scope.run(() => {
    api = useResumePrompt(handlers);
  });
  return { api: api!, scope };
}

beforeEach(() => {
  vi.useFakeTimers();
  player.resumePrompt = null;
  settings.playback.resumePromptTimeout = 7;
});

describe('useResumePrompt', () => {
  it('arms the timer for a prompt set before mount and auto-clears it', async () => {
    player.resumePrompt = { path: '/a.mp3', position: 30 };
    const { scope } = mount({ onContinue: vi.fn() });
    await nextTick();
    expect(player.resumePrompt).not.toBeNull();

    vi.advanceTimersByTime(7000);
    expect(player.resumePrompt).toBeNull();
    scope.stop();
  });

  it('pause stops the countdown; resume arms it again', async () => {
    player.resumePrompt = { path: '/a.mp3', position: 30 };
    const { api, scope } = mount({ onContinue: vi.fn() });
    await nextTick();

    api.pause();
    vi.advanceTimersByTime(7000);
    expect(player.resumePrompt).not.toBeNull();

    api.resume();
    vi.advanceTimersByTime(7000);
    expect(player.resumePrompt).toBeNull();
    scope.stop();
  });

  it('onContinue invokes the handler and clears the prompt', async () => {
    const onContinue = vi.fn();
    player.resumePrompt = { path: '/b.mp3', position: 12 };
    const { api, scope } = mount({ onContinue });
    await nextTick();

    api.onContinue();
    expect(onContinue).toHaveBeenCalledWith({ path: '/b.mp3', position: 12 });
    expect(player.resumePrompt).toBeNull();
    scope.stop();
  });

  it('onStart is optional and still clears the prompt', async () => {
    player.resumePrompt = { path: '/c.mp3', position: 8 };
    const { api, scope } = mount({ onContinue: vi.fn() });
    await nextTick();

    expect(() => api.onStart()).not.toThrow();
    expect(player.resumePrompt).toBeNull();
    scope.stop();
  });
});
