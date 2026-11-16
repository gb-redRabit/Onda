import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';

const h = vi.hoisted(() => ({ resume: vi.fn() }));

vi.mock('@renderer/modules/audioEngine', () => ({
  audioEngine: { resume: h.resume }
}));

import { usePlayerNavigation } from '../player-navigation';

function track(id: string, type: 'audio' | 'video' = 'audio'): MediaFile {
  return {
    id,
    name: id,
    path: `/music/${id}`,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type,
    addedAt: 0,
    playCount: 0
  } as MediaFile;
}

let queue: ReturnType<typeof ref<MediaFile[]>>;
let pending: ReturnType<typeof ref<MediaFile[]>>;
let recordPlay: ReturnType<typeof vi.fn>;
let nav: ReturnType<typeof usePlayerNavigation>;

beforeEach(() => {
  h.resume.mockClear();
  queue = ref<MediaFile[]>([]);
  pending = ref<MediaFile[]>([]);
  recordPlay = vi.fn();
  nav = usePlayerNavigation(queue as never, pending as never, recordPlay as never);
});

describe('setTrack', () => {
  it('records history, resumes video and stores the resume intent', () => {
    nav.setTrack(track('a'));
    nav.setTrack(track('b', 'video'), { resume: true });

    expect(nav.history.value.map((item) => item.id)).toEqual(['a']);
    expect(h.resume).toHaveBeenCalled();
    expect(recordPlay).toHaveBeenCalledTimes(2);
    expect(nav.isPlaying.value).toBe(true);
    expect(nav.consumeResumeIntent('/music/b')).toBe(true);
    expect(nav.consumeResumeIntent('/music/b')).toBe(false);
  });

  it('caps the history at 100 entries', () => {
    for (let i = 0; i < 105; i += 1) nav.setTrack(track(`t${i}`));
    expect(nav.history.value).toHaveLength(100);
  });

  it('keeps playback paused while the PiP window is active', () => {
    nav.enterPiP(5);
    nav.setTrack(track('a'));
    expect(nav.isPlaying.value).toBe(false);
  });
});

describe('transport controls', () => {
  it('toggles playback, seeks, shuffles and cycles repeat', () => {
    nav.togglePlay();
    expect(nav.isPlaying.value).toBe(true);
    nav.pause();
    expect(nav.isPlaying.value).toBe(false);
    nav.play();
    expect(nav.isPlaying.value).toBe(true);
    nav.seek(12);
    expect(nav.currentTime.value).toBe(12);
    nav.toggleShuffle();
    expect(nav.shuffle.value).toBe(true);
    nav.cycleRepeat();
    expect(nav.repeat.value).toBe('all');
    nav.cycleRepeat();
    expect(nav.repeat.value).toBe('one');
    nav.cycleRepeat();
    expect(nav.repeat.value).toBe('none');
  });

  it('restarts the same track in repeat-one mode', () => {
    nav.setTrack(track('a'));
    nav.seek(50);
    nav.repeat.value = 'one';

    const next = nav.nextTrack();
    expect(next?.id).toBe('a');
    expect(nav.currentTime.value).toBe(0);
  });

  it('takes from the pending queue in order or at random', () => {
    pending.value = [track('p1'), track('p2')];
    expect(nav.nextTrack()?.id).toBe('p1');

    pending.value = [track('p3'), track('p4')];
    nav.shuffle.value = true;
    expect(['p3', 'p4']).toContain(nav.nextTrack()?.id);
  });

  it('plays the queue and pops entries from it', () => {
    queue.value = [track('q1'), track('q2')];
    expect(nav.nextTrack()?.id).toBe('q1');
    expect(queue.value.map((item) => item.id)).toEqual(['q2']);

    nav.shuffle.value = true;
    queue.value = [track('q3'), track('q4')];
    expect(['q3', 'q4']).toContain(nav.nextTrack()?.id);
  });

  it('replays history in repeat-all mode or returns null', () => {
    expect(nav.nextTrack()).toBeNull();

    nav.setTrack(track('a'));
    nav.setTrack(track('b'));
    nav.repeat.value = 'all';

    expect(nav.nextTrack()?.id).toBe('a');
  });
});

describe('history navigation', () => {
  it('ignores a missing history entry', () => {
    expect(() => nav.playFromHistory(0)).not.toThrow();
    expect(recordPlay).not.toHaveBeenCalled();
  });

  it('plays a history entry and moves the current track back', () => {
    nav.setTrack(track('a'));
    nav.setTrack(track('b'));

    nav.playFromHistory(0);
    expect(nav.currentTrack.value?.id).toBe('a');
    expect(nav.history.value[0]?.id).toBe('b');
  });

  it('caps history when replaying an entry', () => {
    nav.setTrack(track('current'));
    for (let i = 0; i < 101; i += 1) nav.history.value.push(track(`h${i}`));

    nav.playFromHistory(99);
    expect(nav.history.value).toHaveLength(100);
  });

  it('returns null when there is no previous track', () => {
    expect(nav.prevTrack()).toBeNull();
  });

  it('restores the previous track and caps history', () => {
    nav.setTrack(track('a'));
    nav.setTrack(track('b'));

    expect(nav.prevTrack()?.id).toBe('a');
    expect(nav.currentTrack.value?.id).toBe('a');

    for (let i = 0; i < 100; i += 1) nav.history.value.push(track(`h${i}`));
    nav.prevTrack();
    expect(nav.history.value.length).toBeLessThanOrEqual(100);
  });
});

describe('PiP and clearing', () => {
  it('clears the current track without recording', () => {
    nav.setTrack(track('a'));
    recordPlay.mockClear();

    nav.clearTrack();
    expect(nav.currentTrack.value).toBeNull();
    expect(nav.isPlaying.value).toBe(false);
    expect(nav.currentTime.value).toBe(0);
    expect(nav.pipTime.value).toBe(0);
    expect(recordPlay).not.toHaveBeenCalled();
  });

  it('enters and exits PiP with default and explicit times', () => {
    nav.seek(30);
    nav.enterPiP();
    expect(nav.pipTime.value).toBe(30);
    expect(nav.isPlaying.value).toBe(false);

    nav.exitPiP();
    expect(nav.currentTime.value).toBe(30);
    expect(nav.isPlaying.value).toBe(true);

    nav.enterPiP(7);
    nav.exitPiP(9);
    expect(nav.currentTime.value).toBe(9);
  });
});

describe('history without a current track', () => {
  it('plays a history entry when nothing is loaded', () => {
    nav.history.value = [track('old')];
    nav.playFromHistory(0);
    expect(nav.currentTrack.value?.id).toBe('old');
  });

  it('restores history without pushing a current track', () => {
    nav.history.value = [track('old')];
    expect(nav.prevTrack()?.id).toBe('old');
  });
});
