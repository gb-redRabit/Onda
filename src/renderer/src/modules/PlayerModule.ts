import type { AppModule } from './ModuleManager';
import { audioEngine } from './audioEngine';
import { usePlayerStore } from '@renderer/stores/player';

export class PlayerModule implements AppModule {
  id = 'player';
  name = 'Player';
  private _active = false;

  init(): void {
    audioEngine.init();
  }

  activate(context?: unknown): void {
    this._active = true;
    audioEngine.resumeContext();

    const player = usePlayerStore();
    const ctx = context as { track?: import('@renderer/types/media').MediaFile } | undefined;

    const track = ctx?.track || player.currentTrack;
    if (track && track.type === 'video') {
      audioEngine.pause();
    } else if (track && track.type === 'audio') {
      if (player.isPlaying) {
        audioEngine.play();
      }
    }
  }

  async deactivate(): Promise<void> {
    this._active = false;
    const player = usePlayerStore();
    if (player.currentTrack?.type === 'video') {
      await audioEngine.deactivate();
    } else {
      // Audio track (or none) — keep playing in the background during navigation.
      audioEngine.savePosition();
    }
  }

  async destroy(): Promise<void> {
    this._active = false;
    await audioEngine.destroy();
  }

  isActive(): boolean {
    return this._active;
  }
}
