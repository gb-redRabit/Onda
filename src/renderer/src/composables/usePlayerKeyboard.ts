import { onMounted, onUnmounted } from 'vue';

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
  showOSD: (text: string, icon: 'play' | 'pause' | 'volume' | 'seek' | 'track' | 'speed', duration?: number) => void;
  skip: (seconds: number) => void;
  setSpeed: (speed: number) => void;
  toggleFullscreen: () => void;
}) {
  const { player, settings, vp, showOSD, skip, setSpeed, toggleFullscreen } = params;

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
        showOSD(
          player.isPlaying ? 'Odtwarzanie' : 'Wstrzymano',
          player.isPlaying ? 'play' : 'pause',
          1000
        );
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
          vp.videoRef.value.volume = player.isMuted ? 0 : newVol;
          showOSD(`Glosnosc: ${Math.round(newVol * 100)}%`, 'volume', 1200);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (vp.videoRef.value) {
          const newVol = Math.max(0, player.volume - 0.05);
          player.setVolume(newVol);
          vp.videoRef.value.volume = player.isMuted ? 0 : newVol;
          showOSD(`Glosnosc: ${Math.round(newVol * 100)}%`, 'volume', 1200);
        }
        break;
      case 'm':
        e.preventDefault();
        player.toggleMute();
        showOSD(
          player.isMuted ? 'Wyciszono' : `Glosnosc: ${Math.round(player.volume * 100)}%`,
          'volume',
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
          showOSD('0:00', 'seek', 1000);
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
