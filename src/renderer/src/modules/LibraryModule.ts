import type { AppModule } from './ModuleManager';
import { useLibraryStore } from '@renderer/stores/library';

export class LibraryModule implements AppModule {
  id = 'library';
  name = 'Library';
  private _active = false;

  init(): void {}

  async activate(_context?: unknown): Promise<void> {
    this._active = true;
    const library = useLibraryStore();
    if (!library.isLoaded && library.tracks.length === 0 && !library.isLoading) {
      await library.loadFromDisk();
    }
    if (library.folders.length > 0 && library.tracks.length === 0 && !library.isScanning) {
      library.scanFolders();
    }
  }

  async deactivate(): Promise<void> {
    this._active = false;
    const library = useLibraryStore();
    if (library.isScanning) {
      library.isScanning = false;
    }
  }

  async destroy(): Promise<void> {
    await this.deactivate();
  }

  isActive(): boolean {
    return this._active;
  }
}
