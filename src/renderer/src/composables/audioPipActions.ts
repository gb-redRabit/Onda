import type { PipMode } from './audioPipState';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { EQUALIZER_PRESETS } from '@renderer/utils/constants';

export function dispatchAudioPipAction(
  action: string,
  getMode: () => PipMode,
  setMode: (m: PipMode) => void
): void {
  const player = usePlayerStore();
  if (action === 'playPause') {
    player.togglePlay();
  } else if (action === 'next') {
    player.nextTrack();
  } else if (action === 'prev') {
    player.prevTrack();
  } else if (action === 'shuffle') {
    player.toggleShuffle();
  } else if (action === 'repeat') {
    player.cycleRepeat();
  } else if (action.startsWith('volume:')) {
    const vol = parseFloat(action.slice(7));
    if (!isNaN(vol)) {
      player.setVolume(vol);
    }
  } else if (action === 'cycleMode') {
    const settings = useSettingsStore();
    const modes: PipMode[] = ['minimal', 'medium', 'max', 'wide'];
    const idx = modes.indexOf(getMode());
    const next = modes[(idx + 1) % modes.length];
    setMode(next);
    settings.updateAppearance({ audioPipMode: next });
  } else if (action === 'mute') {
    player.toggleMute();
  } else if (action.startsWith('eqPreset:')) {
    const presetName = action.slice(9);
    const { applyEqPreset } = useAudioPlayer();
    const presets = EQUALIZER_PRESETS;
    if (presets[presetName]) {
      player.equalizerPreset = presetName;
      applyEqPreset(presets[presetName]);
    }
  }
}
