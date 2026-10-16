import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Skróty przesunięcia napisów są globalne (jak A–B i EQ): bez kontekstu widoku
// odtwarzacza zmieniają tylko stan opóźnienia i pokazują wskaźnik.

const notify = vi.fn();

vi.mock('../useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    currentTime: { value: 0 },
    setEqEnabled: vi.fn(),
    applyEqBands: vi.fn(),
    setEqSnap: vi.fn(),
    setEqMono: vi.fn()
  })
}));

vi.mock('@renderer/stores/settings', () => ({
  useSettingsStore: () => ({
    shortcuts: {
      'ab-set-a': '[',
      'ab-set-b': ']',
      'ab-clear': '\\',
      'subtitle-delay-down': 'Z',
      'subtitle-delay-up': 'X',
      'subtitle-delay-reset': 'Ctrl+Shift+D'
    }
  })
}));

vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({ setAbA: vi.fn(), setAbB: vi.fn(), clearAb: vi.fn() })
}));

vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify }) }));

vi.mock('@renderer/i18n', () => ({
  i18n: {
    global: {
      t: (key: string, params?: Record<string, unknown>) => `${key}:${params?.delay ?? ''}`
    }
  }
}));

const { handlePlayerShortcutKeydown } = await import('../playerShortcutHandler');
const { subtitleDelayMs, resetSubtitleDelay } = await import('../subtitleDelay');

function fire(partial: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...partial });
  document.body.dispatchEvent(e);
  handlePlayerShortcutKeydown(e);
  return e;
}

describe('subtitle delay shortcuts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetSubtitleDelay();
    notify.mockClear();
  });

  it('nudges the delay by 50 ms on X/Z and shows the indicator', () => {
    const e = fire({ key: 'x' });
    expect(e.defaultPrevented).toBe(true);
    expect(subtitleDelayMs.value).toBe(50);
    expect(notify).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('player.subtitleDelay'),
      undefined,
      1400
    );

    fire({ key: 'z' });
    expect(subtitleDelayMs.value).toBe(0);
  });

  it('uses a 500 ms step with Shift', () => {
    fire({ key: 'x', shiftKey: true });
    expect(subtitleDelayMs.value).toBe(500);
    fire({ key: 'z', shiftKey: true });
    expect(subtitleDelayMs.value).toBe(0);
  });

  it('resets to zero on Ctrl+Shift+D', () => {
    fire({ key: 'x', shiftKey: true });
    expect(subtitleDelayMs.value).toBe(500);
    const e = fire({ key: 'd', ctrlKey: true, shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(subtitleDelayMs.value).toBe(0);
  });
});
