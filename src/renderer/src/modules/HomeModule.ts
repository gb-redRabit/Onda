import type { AppModule } from './ModuleManager';

export class HomeModule implements AppModule {
  id = 'home';
  name = 'Home';
  private _active = false;

  activate(_context?: unknown): void {
    this._active = true;
  }

  async deactivate(): Promise<void> {
    this._active = false;
  }

  isActive(): boolean {
    return this._active;
  }
}
