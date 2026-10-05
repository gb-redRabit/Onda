import type { AppModule } from './ModuleManager';
import { useExplorerStore } from '@renderer/stores/explorer';

export class ExplorerModule implements AppModule {
  id = 'explorer';
  name = 'Explorer';
  private _active = false;

  activate(_context?: unknown): void {
    this._active = true;
    const explorer = useExplorerStore();
    if (!explorer.currentPath) {
      explorer.navigateTo('');
    }
  }

  async deactivate(): Promise<void> {
    this._active = false;
  }

  isActive(): boolean {
    return this._active;
  }
}
