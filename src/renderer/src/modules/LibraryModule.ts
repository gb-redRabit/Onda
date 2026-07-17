import type { AppModule } from './ModuleManager'
import { useLibraryStore } from '@renderer/stores/library'

export class LibraryModule implements AppModule {
  id = 'library'
  name = 'Library'
  private _active = false

  init(): void {}

  activate(_context?: unknown): void {
    this._active = true
    const library = useLibraryStore()
    if (library.tracks.length === 0 && !library.isScanning) {
      // Library will be populated via scan or IPC
    }
  }

  async deactivate(): Promise<void> {
    this._active = false
    const library = useLibraryStore()
    if (library.isScanning) {
      library.isScanning = false
    }
  }

  async destroy(): Promise<void> {
    await this.deactivate()
  }

  isActive(): boolean {
    return this._active
  }
}
