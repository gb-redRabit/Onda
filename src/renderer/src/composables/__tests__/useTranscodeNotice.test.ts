import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  notify: vi.fn(() => 'toast-1'),
  update: vi.fn(),
  remove: vi.fn(),
  t: vi.fn((key: string, params?: { percent?: number }) =>
    params?.percent === undefined ? key : `${key}:${params.percent}`
  )
}));

vi.mock('@renderer/stores/ui', () => ({
  useUIStore: () => ({
    notify: h.notify,
    updateNotification: h.update,
    removeNotification: h.remove
  })
}));
vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: h.t } } }));

import { useTranscodeNotice } from '../useTranscodeNotice';

beforeEach(() => {
  h.notify.mockClear();
  h.notify.mockReturnValue('toast-1');
  h.update.mockClear();
  h.remove.mockClear();
  h.t.mockClear();
});

describe('useTranscodeNotice', () => {
  it('creates one sticky toast on start', () => {
    const notice = useTranscodeNotice();

    notice.start();

    expect(h.notify).toHaveBeenCalledWith('info', 'player.transcodingVideo', undefined, 0);
  });

  it('updates the same toast with the percentage', () => {
    const notice = useTranscodeNotice();
    notice.progress(42);
    expect(h.update).not.toHaveBeenCalled();

    notice.start();
    notice.progress(42);

    expect(h.update).toHaveBeenCalledWith('toast-1', {
      progress: 42,
      message: 'player.transcodingProgress:42'
    });
  });

  it('hides the percentage when the duration is unknown', () => {
    const notice = useTranscodeNotice();
    notice.start();

    notice.progress(-1);

    expect(h.update).toHaveBeenCalledWith('toast-1', { progress: undefined, message: undefined });
  });

  it('turns the toast into success or an error and clears it', () => {
    const notice = useTranscodeNotice();

    notice.finish(true);
    expect(h.update).not.toHaveBeenCalled();

    notice.start();
    notice.finish(true);
    expect(h.update).toHaveBeenCalledWith('toast-1', {
      type: 'success',
      title: 'player.transcodingDone',
      message: undefined,
      progress: undefined,
      duration: 2500
    });

    notice.start();
    notice.finish(false);
    expect(h.update).toHaveBeenLastCalledWith('toast-1', {
      type: 'error',
      title: 'player.videoUnsupported',
      message: undefined,
      progress: undefined,
      duration: 5000
    });
  });

  it('removes the toast when a transcode is cancelled', () => {
    const notice = useTranscodeNotice();
    notice.cancel();
    expect(h.remove).not.toHaveBeenCalled();

    notice.start();
    notice.cancel();
    expect(h.remove).toHaveBeenCalledWith('toast-1');

    notice.finish(true);
    expect(h.update).not.toHaveBeenCalled();
  });
});
