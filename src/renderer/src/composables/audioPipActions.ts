import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { usePlayerStore } from '@renderer/stores/player';
import { EQUALIZER_PRESETS } from '@renderer/utils/constants';

export function dispatchAudioPipAction(action: string): void {
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
