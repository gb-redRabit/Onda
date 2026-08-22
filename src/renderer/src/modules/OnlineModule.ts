import type { AppModule } from './ModuleManager';
import { useOnlineStore } from '@renderer/stores/online';

export class OnlineModule implements AppModule {
  id = 'online';
  name = 'Online';
  private _active = false;

  init(): void {
    // Nothing to set up eagerly — search state lives in the store.
  }

  activate(_context?: unknown): void {
    this._active = true;
  }

  async deactivate(): Promise<void> {
    this._active = false;
    const yt = useOnlineStore();
    yt.isSearching = false;
  }

  async destroy(): Promise<void> {
    this._active = false;
    const yt = useOnlineStore();
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
