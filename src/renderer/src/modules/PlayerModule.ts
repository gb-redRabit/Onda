import type { AppModule } from './ModuleManager';
import { audioEngine } from './audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import { isCoreShell } from '@renderer/utils/runtimeMode';

export class PlayerModule implements AppModule {
  id = 'player';
  name = 'Player';
  private _active = false;

  activate(context?: unknown): void {
    this._active = true;
    // W trybie shellu audio należy do Core — shell nie może tworzyć drugiego kontekstu.
    if (isCoreShell()) return;
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
    if (isCoreShell()) return;
    const player = usePlayerStore();
    if (player.currentTrack?.type === 'video') {
      await audioEngine.deactivate();
    } else {
      // Utwór audio (lub brak) — graj dalej w tle podczas nawigacji.
      audioEngine.savePosition();
    }
  }

  async destroy(): Promise<void> {
    this._active = false;
    if (isCoreShell()) return;
    await audioEngine.destroy();
  }

  isActive(): boolean {
    return this._active;
  }
}
