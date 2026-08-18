import { onMounted, onUnmounted } from 'vue';
import { audioEngine } from '@renderer/modules/audioEngine';

export function usePlayerKeyboard(params: {
  player: {
    pipActive: boolean;
    volume: number;
    isMuted: boolean;
    isPlaying: boolean;
    currentTime: number;
    togglePlay: () => void;
    toggleMute: () => void;
    setVolume: (v: number) => void;
  };
  settings: {
    playback: {
      playbackSpeed: number;
    };
  };
  vp: {
    videoRef: { value: HTMLVideoElement | null };
  };
  notify: (text: string, duration?: number) => void;
  skip: (seconds: number) => void;
  setSpeed: (speed: number) => void;
  toggleFullscreen: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const { player, settings, vp, notify, skip, setSpeed, toggleFullscreen, t } = params;

  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        if (player.pipActive) return;
        player.togglePlay();
        notify(player.isPlaying ? t('player.playing') : t('player.paused'), 1000);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        skip(e.shiftKey ? -30 : -10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        skip(e.shiftKey ? 30 : 10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (vp.videoRef.value) {
          const newVol = Math.min(1, player.volume + 0.05);
          player.setVolume(newVol);
          audioEngine.setVideoVolume(player.isMuted ? 0 : newVol);
          notify(t('player.volume', { n: Math.round(newVol * 100) }), 1200);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (vp.videoRef.value) {
          const newVol = Math.max(0, player.volume - 0.05);
          player.setVolume(newVol);
          audioEngine.setVideoVolume(player.isMuted ? 0 : newVol);
          notify(t('player.volume', { n: Math.round(newVol * 100) }), 1200);
        }
        break;
      case 'm':
        e.preventDefault();
        player.toggleMute();
        notify(
          player.isMuted ? t('player.muted') : t('player.volume', { n: Math.round(player.volume * 100) }),
          1200
        );
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case '<':
        e.preventDefault();
        setSpeed(settings.playback.playbackSpeed - 0.25);
        break;
      case '>':
        e.preventDefault();
        setSpeed(settings.playback.playbackSpeed + 0.25);
        break;
      case '0':
        e.preventDefault();
        if (vp.videoRef.value) {
          vp.videoRef.value.currentTime = 0;
          player.currentTime = 0;
          notify('0:00', 1000);
        }
        break;
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown);
  });
}
