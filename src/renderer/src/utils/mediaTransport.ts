import { audioEngine } from '@renderer/modules/audioEngine';

/**
 * Shared media transport helpers used by both the player view (HTMLVideoElement)
 * and the audio engine (no <video> on screen, e.g. an audio track in /player).
 */

export function applyVolumeTarget(
  video: HTMLVideoElement | null,
  muted: boolean,
  volume: number
): void {
  const target = muted ? 0 : volume;
  if (video) {
    audioEngine.setVideoVolume(target);
  } else {
    audioEngine.setVolume(target);
  }
}

export function seekTarget(video: HTMLVideoElement | null, time: number): void {
  if (video) {
    video.currentTime = time;
  } else {
    audioEngine.seek(time);
  }
}

export function getTargetPosition(
  video: HTMLVideoElement | null
): { currentTime: number; duration: number } | null {
  if (video) return { currentTime: video.currentTime, duration: video.duration || 0 };
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
