import { logger } from '@shared/logger';

export interface AppModule {
  id: string;
  name: string;
  priority?: number;
  init?(): void;
  activate(context?: unknown): void | Promise<void>;
  deactivate?(): Promise<void>;
  destroy?(): Promise<void>;
  isActive(): boolean;
}

export class ModuleManager {
  private modules = new Map<string, AppModule>();
  private activeModuleId: string | null = null;
  private initialized = false;
  // Rosnący token przełączenia. Dwa nakładające się `switchTo` (guard routera może
  // je wywołać, zanim pierwsze się zakończy, bo `activate` bywa asynchroniczne)
  // mogłyby zakończyć się w złej kolejności i ustawić `activeModuleId` na
  // przedawniony moduł. Token rozstrzyga, kto jest ostatnim wywołującym.
  private switchToken = 0;

  register(module: AppModule): void {
    this.modules.set(module.id, module);
  }

  async initAll(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const sorted = [...this.modules.values()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const module of sorted) {
      module.init?.();
    }
  }

  async switchTo(moduleId: string, context?: unknown): Promise<void> {
    const target = this.modules.get(moduleId);
    if (!target) {
      logger.warn('ModuleManager', `switchTo: unknown module '${moduleId}'`);
      return;
    }

    if (this.activeModuleId === moduleId) return;

    const token = ++this.switchToken;

    try {
      const active = this.getActive();
      if (active) {
        await active.deactivate?.();
      }

      // `activate` bywa asynchroniczne (np. LibraryModule wczytuje bibliotekę) —
      // bez `await` `activeModuleId` był ustawiany zanim moduł był gotowy, a odrzucenie
      // stawało się nieobsłużonym floating promise.
      await target.activate(context);
    } catch (e) {
      // Odrzucenie `activate`/`deactivate` nie może ustawić modułu jako aktywnego
      // ani zostawić nieobsłużonego promise — logujemy i nie zmieniamy stanu.
      logger.error('ModuleManager', `switchTo '${moduleId}' failed`, e);
      return;
    }

    // Tylko ostatnie wywołanie ustawia stan. Przedawnione przełączenie kończy się
    // bez efektu — ale jego `activate` mógł już ustawić `_active = true` przed
    // swoim await, więc musimy go jawnie zdezaktywować, aby nie pozostawał
    // „aktywny" bez wpisu w `activeModuleId` (inaczej kolejny switchTo go pomija).
    if (token !== this.switchToken) {
      try {
        await target.deactivate?.();
      } catch (e) {
        logger.error('ModuleManager', `stale deactivate '${moduleId}' failed`, e);
      }
      return;
    }
    this.activeModuleId = moduleId;
  }

  async deactivateAll(): Promise<void> {
    // Unieważnia ewentualne przełączenie w locie: jego `activate` nie może już
    // ustawić `activeModuleId` po tym, jak wszystko zostało dezaktywowane.
    this.switchToken++;
    for (const module of this.modules.values()) {
      if (module.isActive()) {
        await module.deactivate?.();
      }
    }
    this.activeModuleId = null;
  }

  async destroyAll(): Promise<void> {
    for (const module of this.modules.values()) {
      await module.destroy?.();
    }
    this.modules.clear();
    this.activeModuleId = null;
  }

  getActive(): AppModule | null {
    if (!this.activeModuleId) return null;
    return this.modules.get(this.activeModuleId) || null;
  }

  getActiveId(): string | null {
    return this.activeModuleId;
  }

  get<T extends AppModule>(id: string): T {
    const mod = this.modules.get(id);
    if (!mod) throw new Error(`[ModuleManager] Module not found: ${id}`);
    return mod as T;
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }
}

export const moduleManager = new ModuleManager();
