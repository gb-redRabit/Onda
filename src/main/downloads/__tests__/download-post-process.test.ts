import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  persist: vi.fn(),
  hashEnabled: vi.fn(),
  embedTags: vi.fn(),
  processCover: vi.fn(),
  applyMeta: vi.fn(),
  removeThumbs: vi.fn(),
  syncLibrary: vi.fn(),
  channelPlaylist: vi.fn(),
  hashFile: vi.fn(),
  findSubs: vi.fn(),
  moveSubs: vi.fn(),
  redact: vi.fn((value: string) => `redacted:${value}`)
}));

vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../download-state', () => ({ persist: state.persist }));
vi.mock('../download-settings', () => ({ readHashFilesEnabled: state.hashEnabled }));
vi.mock('../sc-tags', () => ({ embedScMp3Tags: state.embedTags }));
vi.mock('../cover-processing', () => ({
  applyMetadataOverride: state.applyMeta,
  processCover: state.processCover,
  removeThumbnailFiles: state.removeThumbs
}));
vi.mock('../library-sync', () => ({ syncDownloadToLibrary: state.syncLibrary }));
vi.mock('../channel-playlist', () => ({ addToChannelPlaylist: state.channelPlaylist }));
vi.mock('../hash-file', () => ({ sha256File: state.hashFile }));
vi.mock('../subtitle-files', () => ({
  findSiblingSubtitleFiles: state.findSubs,
  moveSubtitlesToFolder: state.moveSubs
}));
vi.mock('../error-classifier', () => ({ redactSecrets: state.redact }));

import { postProcess, runCoverStep } from '../download-post-process';

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    url: 'https://video',
    kind: 'video',
    outputPath: 'D:/out/file.mp4',
    source: { mode: 'youtube' },
    ...overrides
  } as never;
}

beforeEach(() => {
  state.loggerWarn.mockReset();
  state.persist.mockReset();
  state.hashEnabled.mockReset();
  state.hashEnabled.mockResolvedValue(false);
  state.embedTags.mockReset();
  state.embedTags.mockResolvedValue(true);
  state.processCover.mockReset();
  state.processCover.mockResolvedValue({ status: 'embedded' });
  state.applyMeta.mockReset();
  state.applyMeta.mockResolvedValue(undefined);
  state.removeThumbs.mockReset();
  state.removeThumbs.mockResolvedValue(undefined);
  state.syncLibrary.mockReset();
  state.syncLibrary.mockResolvedValue({ inLibrary: false });
  state.channelPlaylist.mockReset();
  state.channelPlaylist.mockResolvedValue(undefined);
  state.hashFile.mockReset();
  state.hashFile.mockResolvedValue('abc123');
  state.findSubs.mockReset();
  state.findSubs.mockResolvedValue([]);
  state.moveSubs.mockReset();
  state.moveSubs.mockResolvedValue(undefined);
  state.redact.mockClear();
});

describe('runCoverStep', () => {
  it('ignores audio without a custom cover', async () => {
    await runCoverStep(job({ kind: 'audio', cover: { type: 'thumbnail' } }));
    expect(state.processCover).not.toHaveBeenCalled();
  });

  it('requires an output path for custom covers', async () => {
    await runCoverStep(job({ kind: 'audio', outputPath: '', cover: { type: 'frame' } }));
    expect(state.processCover).not.toHaveBeenCalled();
  });

  it('processes custom audio covers and persists both states', async () => {
    const media = job({
      kind: 'audio',
      cover: { type: 'clip' },
      coverError: 'old'
    }) as Record<string, any>;
    state.processCover.mockResolvedValueOnce({ status: 'saved' });

    await runCoverStep(media as never);

    expect(media.coverStatus).toBe('saved');
    expect(media.coverError).toBeUndefined();
    expect(state.persist).toHaveBeenCalledTimes(2);
    expect(state.processCover).toHaveBeenCalledWith({
      taskId: 'job-1',
      url: 'https://video',
      cover: { type: 'clip' },
      outputPath: 'D:/out/file.mp4',
      sourceMode: 'youtube'
    });
  });

  it('keeps a redacted error reason', async () => {
    const media = job({ kind: 'audio', cover: { type: 'frame' } }) as Record<string, any>;
    state.processCover.mockResolvedValueOnce({ status: 'error', error: 'secret boom' });

    await runCoverStep(media as never);

    expect(state.redact).toHaveBeenCalledWith('secret boom');
    expect(media.coverError).toBe('redacted:secret boom');
  });

  it('removes left-over thumbnails for embedded covers', async () => {
    const media = job({ kind: 'audio', cover: { type: 'thumbnail' } }) as Record<string, any>;

    await runCoverStep(media as never);

    expect(media.coverStatus).toBe('embedded');
    expect(state.removeThumbs).toHaveBeenCalledWith('D:/out/file.mp4');
  });

  it('skips thumbnail cleanup without an output path', async () => {
    await runCoverStep(job({ kind: 'audio', outputPath: '', cover: { type: 'thumbnail' } }));
    expect(state.removeThumbs).not.toHaveBeenCalled();
  });
});

describe('SoundCloud tags', () => {
  it('embeds tags with a safe https thumbnail', async () => {
    const media = job({
      kind: 'audio',
      source: { mode: 'soundcloud' },
      title: 'Song',
      channelTitle: 'Channel',
      metaOverride: { artist: 'Artist', album: 'Album', year: 2020 },
      thumbnail: 'https://img/x.jpg'
    }) as Record<string, any>;

    await postProcess(media as never);

    expect(state.embedTags).toHaveBeenCalledWith('D:/out/file.mp4', {
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      year: 2020,
      thumbnailUrl: 'https://img/x.jpg'
    });
    expect(media.coverStatus).toBe('embedded');
  });

  it('falls back to the channel and drops insecure thumbnails', async () => {
    await postProcess(
      job({
        kind: 'audio',
        source: { mode: 'soundcloud' },
        title: 'Song',
        channelTitle: 'Channel',
        thumbnail: 'http://img/x.jpg'
      })
    );

    expect(state.embedTags).toHaveBeenCalledWith(
      'D:/out/file.mp4',
      expect.objectContaining({ artist: 'Channel', thumbnailUrl: undefined })
    );
  });

  it('marks covers as none when tagging fails', async () => {
    state.embedTags.mockResolvedValueOnce(false);
    const media = job({ kind: 'audio', source: { mode: 'soundcloud' } }) as Record<string, any>;

    await postProcess(media as never);

    expect(media.coverStatus).toBe('none');
  });

  it('skips tagging without an output path', async () => {
    await postProcess(job({ kind: 'audio', outputPath: '', source: { mode: 'soundcloud' } }));
    expect(state.embedTags).not.toHaveBeenCalled();
  });
});

describe('metadata override', () => {
  it('applies overrides outside SoundCloud', async () => {
    const media = job({ metaOverride: { title: 'New' } });
    await postProcess(media as never);
    expect(state.applyMeta).toHaveBeenCalledWith('D:/out/file.mp4', { title: 'New' });
  });

  it('skips overrides for SoundCloud', async () => {
    await postProcess(
      job({ kind: 'video', source: { mode: 'soundcloud' }, metaOverride: { title: 'New' } })
    );
    expect(state.applyMeta).not.toHaveBeenCalled();
  });

  it('logs override failures', async () => {
    state.applyMeta.mockRejectedValueOnce(new Error('tags'));
    await postProcess(job({ metaOverride: { title: 'New' } }));

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'downloads',
      'metadata override failed for job-1',
      expect.any(Error)
    );
  });
});

describe('library sync', () => {
  it('marks the job and adds it to the channel playlist', async () => {
    state.syncLibrary.mockResolvedValueOnce({ inLibrary: true, file: { path: 'D:/out/file.mp4' } });
    const media = job({ channelTitle: 'Channel' }) as Record<string, any>;

    await postProcess(media as never);

    expect(media.inLibrary).toBe(true);
    expect(state.persist).toHaveBeenCalled();
    expect(state.channelPlaylist).toHaveBeenCalledWith('Channel', { path: 'D:/out/file.mp4' });
  });

  it('skips the playlist without a channel or file', async () => {
    state.syncLibrary.mockResolvedValueOnce({ inLibrary: true });
    await postProcess(job());
    expect(state.channelPlaylist).not.toHaveBeenCalled();

    state.syncLibrary.mockResolvedValueOnce({ inLibrary: true, file: { path: 'x' } });
    await postProcess(job());
    expect(state.channelPlaylist).not.toHaveBeenCalled();
  });

  it('does nothing when not in the library', async () => {
    await postProcess(job());
    expect(state.persist).not.toHaveBeenCalled();
  });

  it('passes the force flag', async () => {
    await postProcess(job({ addToLibrary: true }));
    expect(state.syncLibrary).toHaveBeenCalledWith('D:/out/file.mp4', { forceAdd: true });
  });
});

describe('hashing', () => {
  it('stores the checksum when enabled', async () => {
    state.hashEnabled.mockResolvedValueOnce(true);
    const media = job() as Record<string, any>;

    await postProcess(media as never);

    expect(media.fileHash).toBe('abc123');
    expect(state.persist).toHaveBeenCalled();
  });

  it('logs hash failures', async () => {
    state.hashEnabled.mockResolvedValueOnce(true);
    state.hashFile.mockRejectedValueOnce(new Error('io'));

    await postProcess(job());

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'downloads',
      'hash failed for job-1',
      expect.any(Error)
    );
  });

  it('skips hashing when disabled', async () => {
    await postProcess(job());
    expect(state.hashFile).not.toHaveBeenCalled();
  });
});

describe('subtitles', () => {
  it('marks embedded video subtitles', async () => {
    const media = job({ subsLangs: 'pl' }) as Record<string, any>;
    await postProcess(media as never);

    expect(media.subtitleStatus).toBe('embedded');
    expect(state.findSubs).not.toHaveBeenCalled();
    expect(state.persist).toHaveBeenCalled();
  });

  it('moves sidecar subtitles when configured', async () => {
    state.findSubs.mockResolvedValueOnce(['a.srt']);
    const media = job({ kind: 'audio', subsLangs: 'pl', subsFolder: true }) as Record<string, any>;

    await postProcess(media as never);

    expect(state.moveSubs).toHaveBeenCalledWith('D:/out/file.mp4');
    expect(media.subtitleStatus).toBe('saved');
  });

  it('keeps sidecar subtitles in place by default', async () => {
    state.findSubs.mockResolvedValueOnce(['a.srt']);
    const media = job({ kind: 'audio', subsLangs: 'pl' }) as Record<string, any>;

    await postProcess(media as never);

    expect(state.moveSubs).not.toHaveBeenCalled();
    expect(media.subtitleStatus).toBe('saved');
  });

  it('reports missing subtitles', async () => {
    const media = job({ kind: 'audio', subsLangs: 'pl' }) as Record<string, any>;
    await postProcess(media as never);

    expect(media.subtitleStatus).toBe('missing');
  });

  it('skips everything without an output path', async () => {
    await postProcess(job({ outputPath: '', subsLangs: 'pl' }));
    expect(state.syncLibrary).not.toHaveBeenCalled();
    expect(state.hashEnabled).not.toHaveBeenCalled();
    expect(state.findSubs).not.toHaveBeenCalled();
  });
});
