import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  queueBatch: vi.fn(),
  profiles: null as any,
  parse: vi.fn(),
  skipped: vi.fn(),
  pick: vi.fn(),
  message: vi.fn(),
  entries: [] as Array<{ url: string; platform?: string }>
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/online', () => ({
  useOnlineStore: () => ({ queueBatch: h.queueBatch })
}));
vi.mock('@renderer/composables/useDownloadProfiles', () => ({
  useDownloadProfiles: () => ({ profiles: h.profiles })
}));
vi.mock('@shared/platform', () => ({ parseBatchInputAll: h.parse }));
vi.mock('@renderer/utils/onlineView', () => ({ countSkippedBatchLines: h.skipped }));
vi.mock('@renderer/utils/onlineBatch', () => ({
  pickTextFile: h.pick,
  batchResultMessage: h.message
}));

import { useOnlineBatch } from '../useOnlineBatch';

beforeEach(() => {
  h.t.mockClear();
  h.queueBatch.mockReset();
  h.queueBatch.mockResolvedValue(2);
  h.profiles = ref([{ id: 'p1', config: { kind: 'audio' } }]);
  h.entries = [{ url: 'https://youtube.com/watch?v=a' }];
  h.parse.mockReset();
  h.parse.mockImplementation(() => h.entries);
  h.skipped.mockReset();
  h.skipped.mockReturnValue(1);
  h.pick.mockReset();
  h.pick.mockResolvedValue(null);
  h.message.mockReset();
  h.message.mockReturnValue('queued message');
});

describe('computed state', () => {
  it('parses entries, skipped lines and SoundCloud presence', () => {
    h.entries = [
      { url: 'https://youtube.com/watch?v=a' },
      { url: 'https://soundcloud.com/a/b', platform: 'soundcloud' }
    ];
    const batch = useOnlineBatch();

    expect(batch.batchEntries.value).toHaveLength(2);
    expect(batch.batchSkippedCount.value).toBe(1);
    expect(h.skipped).toHaveBeenCalledWith('', 2);
    expect(batch.batchHasSc.value).toBe(true);
  });

  it('reports no SoundCloud entries for plain input', () => {
    const batch = useOnlineBatch();
    expect(batch.batchHasSc.value).toBe(false);
  });
});

describe('submitBatch', () => {
  it('does nothing for an empty parse', async () => {
    h.entries = [];
    const batch = useOnlineBatch();

    await batch.submitBatch();

    expect(h.queueBatch).not.toHaveBeenCalled();
    expect(batch.batchBusy.value).toBe(false);
  });

  it('queues URLs with the selected profile and clears the input', async () => {
    h.entries = [{ url: 'https://youtube.com/watch?v=a' }, { url: 'https://soundcloud.com/a/b' }];
    const batch = useOnlineBatch();
    batch.batchText.value = 'raw input';
    batch.batchProfileId.value = 'p1';

    await batch.submitBatch();

    expect(h.queueBatch).toHaveBeenCalledWith(
      ['https://youtube.com/watch?v=a', 'https://soundcloud.com/a/b'],
      { kind: 'audio' }
    );
    expect(h.message).toHaveBeenCalledWith(h.t, 2, 1);
    expect(batch.batchResult.value).toBe('queued message');
    expect(batch.batchText.value).toBe('');
    expect(batch.batchBusy.value).toBe(false);
  });

  it('omits the config for an unknown profile and keeps text when nothing queued', async () => {
    h.queueBatch.mockResolvedValueOnce(0);
    const batch = useOnlineBatch();
    batch.batchText.value = 'raw';
    batch.batchProfileId.value = 'missing';

    await batch.submitBatch();

    expect(h.queueBatch).toHaveBeenCalledWith(['https://youtube.com/watch?v=a'], undefined);
    expect(batch.batchText.value).toBe('raw');
  });

  it('reports queuing failures and resets busy', async () => {
    h.queueBatch.mockRejectedValueOnce(new Error('offline'));
    const batch = useOnlineBatch();
    batch.batchText.value = 'raw';

    await batch.submitBatch();

    expect(batch.batchResult.value).toBe('youtube.batchError');
    expect(batch.batchBusy.value).toBe(false);
    expect(batch.batchText.value).toBe('raw');
  });
});

describe('importBatchFile', () => {
  it('loads text from the picker', async () => {
    h.pick.mockResolvedValueOnce('file contents');
    const batch = useOnlineBatch();

    await batch.importBatchFile();

    expect(h.pick).toHaveBeenCalledWith(h.t);
    expect(batch.batchText.value).toBe('file contents');
  });

  it('keeps the current text when the picker is cancelled', async () => {
    const batch = useOnlineBatch();
    batch.batchText.value = 'existing';

    await batch.importBatchFile();

    expect(batch.batchText.value).toBe('existing');
  });
});
