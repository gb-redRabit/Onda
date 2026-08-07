import { ref } from 'vue';
import type { Ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { audioEngine } from '@renderer/modules/audioEngine';

export function usePlayerNavigation(
  queue: Ref<MediaFile[]>,
  pendingQueue: Ref<MediaFile[]>,
  recordPlay: (track: MediaFile) => void
) {
  const currentTrack = ref<MediaFile | null>(null);
  const history = ref<MediaFile[]>([]);
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const pipActive = ref(false);
  const pipTime = ref(0);
  const shuffle = ref(false);
  const repeat = ref<'none' | 'all' | 'one'>('none');

  function setTrack(track: MediaFile) {
    if (currentTrack.value) {
      history.value.unshift(currentTrack.value);
      if (history.value.length > 100) history.value.pop();
    }
    if (track.type === 'video') audioEngine.resume();
    currentTrack.value = track;
    currentTime.value = 0;
    pipTime.value = 0;
    if (!pipActive.value) {
      isPlaying.value = true;
    }
    recordPlay(track);
  }

  function play() {
    isPlaying.value = true;
  }
  function pause() {
    isPlaying.value = false;
  }
  function togglePlay() {
    isPlaying.value = !isPlaying.value;
  }
  function seek(time: number) {
    currentTime.value = time;
  }
  function toggleShuffle() {
    shuffle.value = !shuffle.value;
  }
  function cycleRepeat() {
    const modes: Array<'none' | 'all' | 'one'> = ['none', 'all', 'one'];
    const idx = modes.indexOf(repeat.value);
    repeat.value = modes[(idx + 1) % modes.length];
  }

  function nextTrack(): MediaFile | null {
    if (repeat.value === 'one' && currentTrack.value) {
      currentTime.value = 0;
      return { ...currentTrack.value };
    }
    if (pendingQueue.value.length > 0) {
      const idx = shuffle.value ? Math.floor(Math.random() * pendingQueue.value.length) : 0;
      const next = pendingQueue.value.splice(idx, 1)[0]!;
      setTrack(next);
      return next;
    }
    if (queue.value.length === 0) {
      if (repeat.value === 'all' && history.value.length > 0) {
        const next = history.value[history.value.length - 1];
        setTrack(next);
        history.value.pop();
        return next;
      }
      return null;
    }
    const nextIdx = shuffle.value ? Math.floor(Math.random() * queue.value.length) : 0;
    const next = queue.value[nextIdx];
    setTrack(next);
    queue.value.splice(nextIdx, 1);
    return next;
  }

  function playFromHistory(index: number) {
    const track = history.value.splice(index, 1)[0];
    if (!track) return;
    if (currentTrack.value) {
      history.value.unshift(currentTrack.value);
      if (history.value.length > 100) history.value.pop();
    }
    currentTrack.value = track;
    currentTime.value = 0;
    isPlaying.value = true;
    recordPlay(track);
  }

  function prevTrack(): MediaFile | null {
    if (history.value.length === 0) {
      return null;
    }
    if (currentTrack.value) {
      history.value.push(currentTrack.value);
      if (history.value.length > 100) history.value.shift();
    }
    const prev = history.value.shift()!;
    currentTrack.value = prev;
    currentTime.value = 0;
    isPlaying.value = true;
    recordPlay(prev);
    return prev;
  }

  return {
    currentTrack,
    history,
    isPlaying,
    currentTime,
    pipActive,
    pipTime,
    shuffle,
    repeat,
    setTrack,
    play,
    pause,
    togglePlay,
    seek,
    toggleShuffle,
    cycleRepeat,
    nextTrack,
    prevTrack,
    playFromHistory
  };
}
