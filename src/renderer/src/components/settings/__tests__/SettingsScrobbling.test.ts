import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import SettingsScrobbling from '../SettingsScrobbling.vue';

// Scrobbling: store, IPC i komponenty UI są podstawione.
const state = vi.hoisted(() => ({
  settings: null as any,
  invoke: vi.fn(),
  status: null as any,
  testResult: { ok: true, username: 'user' } as any,
  authStart: { ok: true } as any,
  authComplete: { ok: true, sessionKey: 'session', username: 'lastfm-user' } as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));

const SettingsGroupStub = { template: '<div><slot /></div>' };
const ButtonStub = { template: '<button><slot /></button>' };
const InputStub = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input />'
};
const ToggleStub = {
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template: '<button />'
};

let wrapper: VueWrapper | null = null;

function mountScrobbling() {
  wrapper = mount(SettingsScrobbling, {
    attachTo: document.body,
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) =>
          params ? `${key}:${JSON.stringify(params)}` : key
      },
      stubs: {
        SettingsGroup: SettingsGroupStub,
        Button: ButtonStub,
        Input: InputStub,
        SettingsToggle: ToggleStub
      }
    }
  });
  return wrapper;
}

function inputs(): any[] {
  return wrapper!.findAllComponents(InputStub);
}

function toggles(): any[] {
  return wrapper!.findAllComponents(ToggleStub);
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

beforeEach(() => {
  vi.useFakeTimers();
  state.settings = reactive({
    apiKeys: { keys: [] as any[] },
    saveImmediate: vi.fn()
  });
  state.status = {
    lastfm: { enabled: false, username: '', session: 's' },
    listenbrainz: { enabled: false, username: '', token: 't' }
  };
  state.testResult = { ok: true, username: 'user' };
  state.authStart = { ok: true };
  state.authComplete = { ok: true, sessionKey: 'session', username: 'lastfm-user' };
  state.invoke.mockReset();
  state.invoke.mockImplementation(async (channel: string) => {
    if (channel === 'scrobbling:status') return state.status;
    if (channel === 'scrobbling:test') return state.testResult;
    if (channel === 'scrobbling:lastfmAuth') return state.authStart;
    if (channel === 'scrobbling:lastfmAuthComplete') return state.authComplete;
    return undefined;
  });
  state.t.mockClear();
  (window as { api?: unknown }).api = { invoke: state.invoke };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('status and previews', () => {
  it('loads status on mount and renders connected users', async () => {
    state.status.lastfm.username = 'dj';
    state.status.listenbrainz = { enabled: true, username: 'lb', token: 't' };
    mountScrobbling();
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('scrobbling:status');
    expect(wrapper!.text()).toContain('dj');
    expect(wrapper!.text()).toContain('lb');
    expect(toggles()[0].props('disabled')).toBe(false);
    expect(toggles()[1].props('disabled')).toBe(false);
  });

  it('falls back to null when status fails', async () => {
    state.invoke.mockRejectedValue(new Error('ipc'));
    mountScrobbling();
    await flush();
    expect(wrapper!.text()).toContain('settings.scrobblingNotConnected');
  });

  it('shows stored previews as input placeholders', async () => {
    state.settings.apiKeys.keys = [
      { id: 'scrobble:lastfm-api-key', key: 'abcd', preview: 'abcd' },
      { id: 'scrobble:lastfm-api-secret', key: 'secret' },
      { id: 'scrobble:listenbrainz-token', key: 'token', preview: 'toke' }
    ];
    mountScrobbling();
    await flush();

    expect(inputs()[0].props('placeholder')).toBe('abcd');
    expect(inputs()[1].props('placeholder')).toBe('••••');
    expect(inputs()[2].props('placeholder')).toBe('toke');
  });
});

describe('Last.fm', () => {
  it('saves credentials, tests and refreshes', async () => {
    mountScrobbling();
    await flush();
    inputs()[0].vm.$emit('update:modelValue', '  key-value  ');
    inputs()[1].vm.$emit('update:modelValue', 'secret-value');

    await wrapper!.get('[data-testid="scrobbling-lastfm-test"]').trigger('click');
    await vi.advanceTimersByTimeAsync(120);
    await flush();

    const keys = state.settings.apiKeys.keys;
    expect(keys.find((k: any) => k.id === 'scrobble:lastfm-api-key')).toMatchObject({
      key: 'key-value',
      preview: 'key-'
    });
    expect(keys.find((k: any) => k.id === 'scrobble:lastfm-api-secret')).toMatchObject({
      key: 'secret-value'
    });
    expect(state.invoke).toHaveBeenCalledWith('scrobbling:test', 'lastfm');
    expect(wrapper!.text()).toContain('Last.fm: user');
    expect(inputs()[0].props('modelValue')).toBe('');
  });

  it('reports a failed test', async () => {
    state.testResult = { ok: false, error: 'bad key' };
    mountScrobbling();
    await flush();
    await wrapper!.get('[data-testid="scrobbling-lastfm-test"]').trigger('click');
    await vi.advanceTimersByTimeAsync(120);
    await flush();
    expect(wrapper!.text()).toContain('bad key');
  });

  it('reports a failed authorization start', async () => {
    state.authStart = { ok: false, error: 'denied' };
    mountScrobbling();
    await flush();
    await wrapper!.get('[data-testid="scrobbling-lastfm-connect"]').trigger('click');
    await vi.advanceTimersByTimeAsync(120);
    await flush();
    expect(wrapper!.text()).toContain('denied');
  });

  it('stores the session and username after browser authorization', async () => {
    mountScrobbling();
    await flush();
    await wrapper!.get('[data-testid="scrobbling-lastfm-connect"]').trigger('click');
    await vi.advanceTimersByTimeAsync(120);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(120);
    await flush();

    const session = state.settings.apiKeys.keys.find(
      (k: any) => k.id === 'scrobble:lastfm-session'
    );
    expect(session).toMatchObject({
      key: 'session',
      isActive: true,
      values: { username: 'lastfm-user' }
    });
    expect(wrapper!.text()).toContain('settings.lastfmConnectedAs');
  });

  it('reports a failed authorization after all polls', async () => {
    state.authComplete = { ok: false, error: 'no session' };
    mountScrobbling();
    await flush();
    await wrapper!.get('[data-testid="scrobbling-lastfm-connect"]').trigger('click');
    await vi.advanceTimersByTimeAsync(120);
    await vi.advanceTimersByTimeAsync(5000 * 36);
    await flush();
    expect(wrapper!.text()).toContain('no session');
  });
});

describe('toggles and ListenBrainz', () => {
  it('enables an existing scrobbler and refreshes status', async () => {
    state.settings.apiKeys.keys = [
      { id: 'scrobble:lastfm-session', service: 'lastfm', name: 'Last.fm session', isActive: false }
    ];
    mountScrobbling();
    await flush();
    state.invoke.mockClear();

    toggles()[0].vm.$emit('update:modelValue', true);
    await flush();

    expect(state.settings.apiKeys.keys[0].isActive).toBe(true);
    expect(state.settings.saveImmediate).toHaveBeenCalled();
    expect(state.invoke).toHaveBeenCalledWith('scrobbling:status');
  });

  it('ignores toggles for missing entries', async () => {
    mountScrobbling();
    await flush();
    toggles()[1].vm.$emit('update:modelValue', true);
    await flush();
    expect(state.settings.apiKeys.keys).toHaveLength(0);
  });

  it('saves and activates the ListenBrainz token after a successful test', async () => {
    state.testResult = { ok: true, username: 'lb-user' };
    mountScrobbling();
    await flush();
    inputs()[2].vm.$emit('update:modelValue', 'token-123');

    await wrapper!.get('[data-testid="scrobbling-listenbrainz-test"]').trigger('click');
    await vi.advanceTimersByTimeAsync(120);
    await flush();

    const token = state.settings.apiKeys.keys.find(
      (k: any) => k.id === 'scrobble:listenbrainz-token'
    );
    expect(token).toMatchObject({
      key: 'token-123',
      isActive: true,
      values: { username: 'lb-user' }
    });
    expect(wrapper!.text()).toContain('ListenBrainz: lb-user');
    expect(inputs()[2].props('modelValue')).toBe('');
  });

  it('reports a failed ListenBrainz test', async () => {
    state.testResult = { ok: false, error: 'invalid token' };
    mountScrobbling();
    await flush();
    await wrapper!.get('[data-testid="scrobbling-listenbrainz-test"]').trigger('click');
    await vi.advanceTimersByTimeAsync(120);
    await flush();
    expect(wrapper!.text()).toContain('invalid token');
  });
});
