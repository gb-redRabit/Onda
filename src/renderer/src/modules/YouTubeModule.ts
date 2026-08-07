import type { AppModule } from './ModuleManager';
import { useYouTubeStore } from '@renderer/stores/youtube';

export class YouTubeModule implements AppModule {
  id = 'youtube';
  name = 'YouTube';
  private _active = false;

  init(): void {
    // Nothing to set up eagerly — search state lives in the store.
  }

  activate(_context?: unknown): void {
    this._active = true;
  }

  async deactivate(): Promise<void> {
    this._active = false;
    const yt = useYouTubeStore();
    yt.isSearching = false;
  }

  async destroy(): Promise<void> {
    this._active = false;
    const yt = useYouTubeStore();
    yt.isSearching = false;
    yt.searchResults = [];
    yt.searchQuery = '';
    yt.nextToken = null;
    yt.prevToken = null;
  }

  isActive(): boolean {
    return this._active;
  }
}
