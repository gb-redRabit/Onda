import type { AppModule } from './ModuleManager'

export class SettingsModule implements AppModule {
  id = 'settings'
  name = 'Settings'
  private _active = false

  init(): void {}

  activate(_context?: unknown): void {
    this._active = true
  }

  async deactivate(): Promise<void> {
    this._active = false
  }

  async destroy(): Promise<void> {
    await this.deactivate()
  }

  isActive(): boolean {
    return this._active
  }
}
