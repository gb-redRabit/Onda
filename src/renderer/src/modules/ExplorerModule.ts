import type { AppModule } from './ModuleManager';
import { useExplorerStore } from '@renderer/stores/explorer';

export class ExplorerModule implements AppModule {
  id = 'explorer';
  name = 'Explorer';
  private _active = false;
  private cleanupListeners: (() => void)[] = [];

  activate(_context?: unknown): void {
    this._active = true;
    const explorer = useExplorerStore();
    if (!explorer.currentPath) {
      explorer.navigateTo('');
    }
  }

  async deactivate(): Promise<void> {
    this._active = false;
    for (const cleanup of this.cleanupListeners) {
      cleanup();
    }
    this.cleanupListeners = [];
  }

  async destroy(): Promise<void> {
    await this.deactivate();
  }

  isActive(): boolean {
    return this._active;
  }
}
