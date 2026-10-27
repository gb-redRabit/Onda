import { audioEngine } from '@renderer/modules/audioEngine';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { isCoreShell } from '@renderer/utils/runtimeMode';

/**
 * Wspólne helpery transportu mediów używane zarówno przez widok odtwarzacza (HTMLVideoElement),
 * jak i silnik audio (brak <video> na ekranie, np. utwór audio w /player).
 */

export function applyVolumeTarget(
  video: HTMLVideoElement | null,
  muted: boolean,
  volume: number
): void {
  const target = muted ? 0 : volume;
  if (video) {
    audioEngine.setVideoVolume(target);
  } else if (isCoreShell()) {
    useAudioPlayer().setVolume(target);
  } else {
    audioEngine.setVolume(target);
  }
}

export function seekTarget(video: HTMLVideoElement | null, time: number): void {
  if (video) {
    video.currentTime = time;
  } else if (isCoreShell()) {
    useAudioPlayer().seek(time);
  } else {
    audioEngine.seek(time);
  }
}

export function getTargetPosition(
  video: HTMLVideoElement | null
): { currentTime: number; duration: number } | null {
  if (video) return { currentTime: video.currentTime, duration: video.duration || 0 };
  if (isCoreShell()) {
    const audio = useAudioPlayer();
    return { currentTime: audio.currentTime.value, duration: audio.duration.value };
  }
  const el = audioEngine.getMediaElement();
  if (!el) return null;
  return { currentTime: el.currentTime, duration: el.duration || 0 };
}

export function skipTarget(video: HTMLVideoElement | null, seconds: number): number | null {
  const target = getTargetPosition(video);
  if (!target) return null;
  const newTime = Math.max(0, Math.min(target.duration, target.currentTime + seconds));
  seekTarget(video, newTime);
  return newTime;
}

/**
 * Normalizuje prędkość odtwarzania: zakres 0.25–3× i siatka 0.05×.
 * Menu i skróty operują na wielokrotności 0.25, więc wcześniejsze zaokrąglanie do 0.1
 * („*10/10”) zamieniało 1.25 na 1.3 i rozjeżdżało ścieżkę w górę/w dół.
 */
export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.round(Math.max(0.25, Math.min(3, speed)) * 20) / 20;
}
