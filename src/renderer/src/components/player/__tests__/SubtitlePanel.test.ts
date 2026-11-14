import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import SubtitlePanel from '../SubtitlePanel.vue';

const state = vi.hoisted(() => ({
  delay: { value: 0 },
  adjust: vi.fn(),
  reset: vi.fn(),
  format: vi.fn((ms: number) => `${ms}ms`),
  player: null as any,
  notify: vi.fn(),
  api: null as any,
  loggerError: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: state.notify }) }));
vi.mock('@renderer/composables/subtitleDelay', () => ({
  subtitleDelayMs: state.delay,
  formatSubtitleDelay: (ms: number) => state.format(ms),
  adjustSubtitleDelay: (delta: number) => state.adjust(delta),
  resetSubtitleDelay: () => state.reset(),
  SUBTITLE_DELAY_STEP_MS: 100
}));
vi.mock('@shared/logger', () => ({
  logger: { error: state.loggerError, warn: vi.fn(), info: vi.fn() }
}));

let wrapper: VueWrapper | null = null;

function subtitleTracks() {
  return [
    { id: 'e1', source: 'embedded', label: 'Embedded track' },
    { id: 'x1', source: 'external', label: 'Folder track' },
    { id: 'c1', source: 'custom', label: 'Custom track' }
  ];
}

function mountPanel() {
  wrapper = mount(SubtitlePanel, {
    attachTo: document.body,
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find((el) =>
    el.textContent?.includes(text)
  );
  if (!button) throw new Error(`button ${text} not found`);
  return button as HTMLButtonElement;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  state.delay.value = 0;
  state.adjust.mockClear();
  state.reset.mockClear();
  state.format.mockClear();
  state.player = reactive({
    subtitleTracks: subtitleTracks(),
    activeSubtitleId: null as string | null,
    currentTrack: { path: 'C:\\video\\movie.mp4', name: 'My.Movie.2020.mp4' },
    setActiveSubtitle: vi.fn((id: string | null) => {
      state.player.activeSubtitleId = id;
    }),
    loadCustomSubtitles: vi.fn(async () => 1),
    toggleSubtitlePanel: vi.fn()
  });
  state.notify.mockClear();
  state.loggerError.mockClear();
  state.api = {
    openSubtitleDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/sub.srt'] })),
    napiProjektCheck: vi.fn(async () => ({ found: true })),
    animeSubSearch: vi.fn(async () => ({
      success: true,
      results: [{ id: 'an1', sh: 'hash', title: 'Anime release', language: 'pl' }]
    })),
    openSubtitlesSearch: vi.fn(async () => ({
      success: true,
      results: [{ fileId: 7, language: 'en', release: 'Open release', downloads: 12 }]
    })),
    napiProjektDownload: vi.fn(async () => ({ success: true, path: '/napi.srt' })),
    animeSubDownload: vi.fn(async () => ({ success: true, path: '/anime.srt' })),
    openSubtitlesDownload: vi.fn(async () => ({ success: true, path: '/os.srt' }))
  };
  state.t.mockClear();
  (window as { api?: unknown }).api = state.api;
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('track list', () => {
  it('groups tracks, selects and disables subtitles', async () => {
    mountPanel();
    expect(wrapper!.text()).toContain('subtitles.embedded');
    expect(wrapper!.text()).toContain('subtitles.fromFolder');
    expect(wrapper!.text()).toContain('subtitles.custom');

    buttonByText('Embedded track').click();
    expect(state.player.setActiveSubtitle).toHaveBeenCalledWith('e1');
    await wrapper!.vm.$nextTick();
    expect(buttonByText('Embedded track').className).toContain('text-primary-text');

    buttonByText('subtitles.disable').click();
    expect(state.player.setActiveSubtitle).toHaveBeenLastCalledWith(null);
  });

  it('hides the disable row without tracks and closes the panel', () => {
    state.player.subtitleTracks = [];
    mountPanel();
    expect(wrapper!.text()).not.toContain('subtitles.disable');
    wrapper!.get('[data-testid="subtitle-panel-close"]').trigger('click');
    expect(state.player.toggleSubtitlePanel).toHaveBeenCalled();
  });

  it('selects folder and custom tracks and marks the active row', async () => {
    state.player.activeSubtitleId = 'x1';
    mountPanel();
    expect(buttonByText('Folder track').classList.contains('text-primary-text')).toBe(true);
    buttonByText('Folder track').click();
    expect(state.player.setActiveSubtitle).toHaveBeenCalledWith('x1');

    state.player.activeSubtitleId = 'c1';
    await wrapper!.vm.$nextTick();
    expect(buttonByText('Custom track').classList.contains('text-primary-text')).toBe(true);
    buttonByText('Custom track').click();
    expect(state.player.setActiveSubtitle).toHaveBeenCalledWith('c1');

    state.player.activeSubtitleId = 'e1';
    await wrapper!.vm.$nextTick();
    expect(buttonByText('subtitles.disable').classList.contains('text-primary-text')).toBe(false);
  });
});

describe('uploading and delay', () => {
  it('uploads custom subtitles and reports unreadable files', async () => {
    state.player.loadCustomSubtitles.mockResolvedValueOnce(2);
    mountPanel();
    buttonByText('subtitles.upload').click();
    await flush();
    expect(state.player.loadCustomSubtitles).toHaveBeenCalledWith(['/sub.srt']);
    expect(state.loggerError).not.toHaveBeenCalled();

    state.api.openSubtitleDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    buttonByText('subtitles.upload').click();
    await flush();
    expect(state.player.loadCustomSubtitles).toHaveBeenCalledTimes(1);

    state.player.loadCustomSubtitles.mockResolvedValueOnce(0);
    buttonByText('subtitles.upload').click();
    await flush();
    expect(state.loggerError).toHaveBeenCalled();
  });

  it('nudges and resets the delay', () => {
    state.delay.value = 250;
    mountPanel();
    expect(wrapper!.get('[data-testid="subtitle-delay-value"]').text()).toBe('250ms');

    wrapper!.get('[data-testid="subtitle-delay-up"]').trigger('click');
    wrapper!.get('[data-testid="subtitle-delay-down"]').trigger('click');
    expect(state.adjust.mock.calls).toEqual([[100], [-100]]);

    wrapper!.get('[data-testid="subtitle-delay-value"]').trigger('click');
    expect(state.reset).toHaveBeenCalled();
  });
});

describe('online search', () => {
  it('uses the track name as a default query and merges providers', async () => {
    mountPanel();
    const input = wrapper!.find('input');
    await input.trigger('keydown.enter');
    await flush();

    expect(state.api.openSubtitlesSearch).toHaveBeenCalledWith({
      query: 'My Movie 2020',
      languages: 'pl'
    });
    expect(state.api.animeSubSearch).toHaveBeenCalledWith({ query: 'My Movie 2020' });
    expect(state.api.napiProjektCheck).toHaveBeenCalledWith({ videoPath: 'C:\\video\\movie.mp4' });

    expect(wrapper!.text()).toContain('OS');
    expect(wrapper!.text()).toContain('Open release');
    expect(wrapper!.text()).toContain('AN');
    expect(wrapper!.text()).toContain('Anime release');
    expect(wrapper!.text()).toContain('NP');
  });

  it('shows mapped OpenSubtitles errors only when nothing was found', async () => {
    state.api.animeSubSearch.mockResolvedValue({ success: false, results: [] });
    state.api.napiProjektCheck.mockResolvedValue({ found: false });
    state.api.openSubtitlesSearch.mockResolvedValue({ success: false, error: 'missing-api-key' });
    mountPanel();
    await wrapper!.find('input').setValue('query');
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('subtitles.onlineNoKey');

    state.api.openSubtitlesSearch.mockResolvedValue({ success: false, error: 'rate-limit' });
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('subtitles.onlineRateLimit');

    state.api.openSubtitlesSearch.mockResolvedValue({ success: false, error: 'boom' });
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('boom');
  });

  it('shows the searching and no-results states', async () => {
    const pending = deferred<unknown>();
    state.api.openSubtitlesSearch.mockReturnValue(pending.promise);
    state.api.animeSubSearch.mockResolvedValue({ success: false, results: [] });
    state.api.napiProjektCheck.mockResolvedValue({ found: false });
    mountPanel();
    await wrapper!.find('input').setValue('query');
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('subtitles.onlineSearching');

    pending.resolve({ success: true, results: [] });
    await flush();
    expect(wrapper!.text()).toContain('subtitles.onlineNoResults');
  });

  it('ignores results from an older search', async () => {
    const first = deferred<any>();
    state.api.openSubtitlesSearch.mockReturnValueOnce(first.promise);
    state.api.animeSubSearch.mockResolvedValue({ success: false, results: [] });
    state.api.napiProjektCheck.mockResolvedValue({ found: false });
    mountPanel();
    await wrapper!.find('input').setValue('old');
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');

    state.api.openSubtitlesSearch.mockResolvedValueOnce({ success: true, results: [] });
    await wrapper!.find('input').setValue('new');
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await flush();

    first.resolve({
      success: true,
      results: [{ fileId: 1, language: 'en', release: 'OLD', downloads: 1 }]
    });
    await flush();
    expect(wrapper!.text()).not.toContain('OLD');
  });

  it('does nothing without a query when the track has no name', async () => {
    state.player.currentTrack = null;
    mountPanel();
    await wrapper!.find('input').setValue('   ');
    await wrapper!.find('input').trigger('keydown.enter');
    await flush();
    expect(state.api.openSubtitlesSearch).not.toHaveBeenCalled();
  });

  it('survives provider transport failures', async () => {
    state.player.currentTrack = { name: 'No path' };
    state.api.napiProjektCheck.mockRejectedValueOnce(new Error('napi'));
    state.api.animeSubSearch.mockRejectedValueOnce(new Error('anime'));
    state.api.openSubtitlesSearch.mockRejectedValueOnce(new Error('os'));
    mountPanel();
    await wrapper!.find('input').setValue('failure');
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await flush();

    expect(wrapper!.text()).toContain('subtitles.onlineNoResults');
  });

  it('continues when the napi check rejects for a video path', async () => {
    state.api.napiProjektCheck.mockRejectedValueOnce(new Error('napi down'));
    mountPanel();
    await wrapper!.find('input').setValue('query');
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await flush();

    expect(wrapper!.text()).toContain('Open release');
  });

  it('defaults missing anime language and empty search language', async () => {
    state.api.animeSubSearch.mockResolvedValue({
      success: true,
      results: [{ id: 'an2', sh: 'hash', title: 'Bare anime' }]
    });
    mountPanel();
    await wrapper!.find('input').setValue('query');
    await wrapper!.find('select').setValue('');
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await flush();

    expect(state.api.openSubtitlesSearch).toHaveBeenCalledWith({
      query: 'query',
      languages: undefined
    });
    expect(wrapper!.text()).toContain('Bare anime');
    expect(wrapper!.text()).toContain('AN');
  });

  it('maps the missing-query error and unknown provider errors', async () => {
    state.api.napiProjektCheck.mockResolvedValue({ found: false });
    state.api.animeSubSearch.mockResolvedValue({ success: false, results: [] });
    state.api.openSubtitlesSearch.mockResolvedValueOnce({
      success: false,
      error: 'missing-query'
    });
    mountPanel();
    await wrapper!.find('input').setValue('query');
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('subtitles.onlineQueryRequired');

    state.api.openSubtitlesSearch.mockResolvedValueOnce({ success: false });
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('unknown');
  });
});

describe('downloading results', () => {
  async function searchAndClickResult(providerText: string): Promise<void> {
    mountPanel();
    await wrapper!.find('input').setValue('query');
    await wrapper!.get('[data-testid="subtitle-online-search"]').trigger('click');
    await flush();
    buttonByText(providerText).click();
    await flush();
  }

  it('loads a downloaded subtitle and notifies success', async () => {
    state.player.loadCustomSubtitles.mockResolvedValue(1);
    await searchAndClickResult('Open release');
    expect(state.api.openSubtitlesDownload).toHaveBeenCalledWith({
      fileId: 7,
      videoPath: 'C:\\video\\movie.mp4',
      language: 'en'
    });
    expect(state.player.loadCustomSubtitles).toHaveBeenCalledWith(['/os.srt']);
    expect(state.notify).toHaveBeenCalledWith('success', 'subtitles.onlineDownloaded');
  });

  it('maps not-found and anime session errors', async () => {
    state.api.napiProjektDownload.mockResolvedValueOnce({ success: false, error: 'not-found' });
    await searchAndClickResult('subtitles.napiDownload');
    expect(state.notify).toHaveBeenCalledWith('info', 'subtitles.napiNotFound');

    state.api.animeSubDownload.mockResolvedValueOnce({ success: false, error: 'no-session' });
    await searchAndClickResult('Anime release');
    expect(state.notify).toHaveBeenCalledWith('error', 'subtitles.animeNoSession');
  });

  it('reports anime, generic and thrown download errors', async () => {
    state.api.animeSubDownload.mockResolvedValueOnce({ success: false, error: 'bad' });
    await searchAndClickResult('Anime release');
    expect(state.notify).toHaveBeenCalledWith('error', 'subtitles.animeDownloadError', 'bad');

    state.api.openSubtitlesDownload.mockResolvedValueOnce({ success: false, error: 'server' });
    await searchAndClickResult('Open release');
    expect(state.notify).toHaveBeenCalledWith('error', 'subtitles.onlineError', 'server');

    state.api.openSubtitlesDownload.mockRejectedValueOnce(new Error('network'));
    await searchAndClickResult('Open release');
    expect(state.notify).toHaveBeenCalledWith('error', 'subtitles.onlineError', 'Error: network');
  });

  it('falls back to empty ids and the current language', async () => {
    state.api.animeSubSearch.mockResolvedValue({
      success: true,
      results: [{ title: 'Bare anime' }]
    });
    state.api.openSubtitlesSearch.mockResolvedValue({
      success: true,
      results: [{ release: 'Bare release' }]
    });
    state.api.animeSubDownload.mockResolvedValueOnce({ success: false, error: 'bad' });
    state.api.openSubtitlesDownload.mockResolvedValueOnce({ success: false, error: 'bad' });

    await searchAndClickResult('Bare anime');
    expect(state.api.animeSubDownload).toHaveBeenCalledWith({
      id: '',
      sh: '',
      videoPath: 'C:\\video\\movie.mp4'
    });

    await searchAndClickResult('Bare release');
    expect(state.api.openSubtitlesDownload).toHaveBeenCalledWith({
      fileId: 0,
      videoPath: 'C:\\video\\movie.mp4',
      language: 'pl'
    });
  });

  it('reports a failed custom-subtitle import after a successful download', async () => {
    state.player.loadCustomSubtitles.mockResolvedValue(0);
    await searchAndClickResult('Open release');

    expect(state.notify).toHaveBeenCalledWith('error', 'subtitles.onlineError', undefined);
  });

  it('downloads without a current track', async () => {
    state.player.currentTrack = null;
    await searchAndClickResult('Open release');

    expect(state.api.openSubtitlesDownload).toHaveBeenCalledWith({
      fileId: 7,
      videoPath: undefined,
      language: 'en'
    });
  });
});
