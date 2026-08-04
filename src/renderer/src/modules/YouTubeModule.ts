import type { AppModule } from './ModuleManager';
import { useYouTubeStore } from '@renderer/stores/youtube';

export class YouTubeModule implements AppModule {
  id = 'youtube';
  name = 'YouTube';
  private _active = false;

  activate(_context?: unknown): void {
    this._active = true;
  }

  async deactivate(): Promise<void> {
    this._active = false;
    const yt = useYouTubeStore();
    yt.isSearching = false;
  }

  isActive(): boolean {
    return this._active;
  }
}
