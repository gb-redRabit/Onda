import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  notify: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: h.notify }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));

import { useOnlineDialogs } from '../useOnlineDialogs';

let openSpy: ReturnType<typeof vi.spyOn>;

function setup(input = 'my query', prefs: string | null = null, unfollow: string | null = null) {
  const inputRef = ref(input);
  const prefsOpen = ref<string | null>(prefs);
  const unfollowTarget = ref<string | null>(unfollow);
  return {
    input: inputRef,
    prefsOpen,
    unfollowTarget,
    ...useOnlineDialogs(inputRef, prefsOpen as never, unfollowTarget as never)
  };
}

function keydown(key: string): KeyboardEvent {
  return { key } as KeyboardEvent;
}

beforeEach(() => {
  h.notify.mockClear();
  h.t.mockClear();
  openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
});

afterEach(() => {
  openSpy.mockRestore();
});

describe('openWatchUrl', () => {
  it('opens https urls in a popup window', () => {
    const { openWatchUrl } = setup();

    openWatchUrl('https://www.youtube.com/watch?v=abc');

    expect(openSpy).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc',
      '_blank',
      'width=1100,height=700'
    );
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('explains why a non-https target cannot be opened', () => {
    const { openWatchUrl } = setup('typed query');

    openWatchUrl('123456');

    expect(openSpy).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith('info', 'typed query', 'youtube.openUnavailable');
  });

  it('falls back to the url when the input is empty', () => {
    const { openWatchUrl } = setup('');

    openWatchUrl('track-id');

    expect(h.notify).toHaveBeenCalledWith('info', 'track-id', 'youtube.openUnavailable');
  });
});

describe('onKeydown', () => {
  it('ignores keys other than Escape', () => {
    const ctx = setup('q', 'prefs');
    ctx.expandedSearchId.value = 'search';
    ctx.expandedResolvedId.value = 'resolved';

    ctx.onKeydown(keydown('Enter'));

    expect(ctx.expandedSearchId.value).toBe('search');
    expect(ctx.expandedResolvedId.value).toBe('resolved');
    expect(ctx.prefsOpen.value).toBe('prefs');
  });

  it('collapses expanded panels and closes the newest dialog first', () => {
    const ctx = setup('q', 'prefs', 'unfollow');
    ctx.expandedSearchId.value = 'search';
    ctx.expandedResolvedId.value = 'resolved';
    ctx.configTarget.value = 'subscription' as never;

    ctx.onKeydown(keydown('Escape'));

    expect(ctx.expandedSearchId.value).toBeNull();
    expect(ctx.expandedResolvedId.value).toBeNull();
    expect(ctx.configTarget.value).toBeNull();
    expect(ctx.prefsOpen.value).toBe('prefs');
    expect(ctx.unfollowTarget.value).toBe('unfollow');
  });

  it('falls back to preferences and then the unfollow dialog', () => {
    const ctx = setup('q', 'prefs', 'unfollow');
    ctx.onKeydown(keydown('Escape'));
    expect(ctx.prefsOpen.value).toBeNull();
    expect(ctx.unfollowTarget.value).toBe('unfollow');

    ctx.onKeydown(keydown('Escape'));
    expect(ctx.unfollowTarget.value).toBeNull();
  });

  it('does nothing when no dialog is open', () => {
    const ctx = setup();

    expect(() => ctx.onKeydown(keydown('Escape'))).not.toThrow();
    expect(ctx.configTarget.value).toBeNull();
    expect(ctx.prefsOpen.value).toBeNull();
    expect(ctx.unfollowTarget.value).toBeNull();
  });
});

describe('toastAdded', () => {
  it('reports a successful save with a short timeout', () => {
    const { toastAdded } = setup();

    toastAdded();

    expect(h.notify).toHaveBeenCalledWith('success', 'youtube.added', undefined, 2000);
  });
});
