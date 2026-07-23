export interface AppModule {
  id: string;
  name: string;
  dependencies?: string[];
  priority?: number;
  init?(): void;
  activate(context?: unknown): void;
  deactivate(): Promise<void>;
  destroy(): Promise<void>;
  isActive(): boolean;
}

class ModuleManager {
  private modules = new Map<string, AppModule>();
  private activeModuleId: string | null = null;
  private initialized = false;

  register(module: AppModule): void {
    this.modules.set(module.id, module);
  }

  async initAll(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const sorted = [...this.modules.values()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const module of sorted) {
      if (module.dependencies) {
        for (const depId of module.dependencies) {
          if (!this.modules.has(depId)) {
          }
        }
      }
      module.init?.();
    }
  }

  async switchTo(moduleId: string, context?: unknown): Promise<void> {
    const target = this.modules.get(moduleId);
    if (!target) {
      return;
    }

    if (this.activeModuleId === moduleId) return;

    const active = this.getActive();
    if (active) {
      await active.deactivate();
    }

    target.activate(context);
    this.activeModuleId = moduleId;
  }

  async deactivateAll(): Promise<void> {
    for (const module of this.modules.values()) {
      if (module.isActive()) {
        await module.deactivate();
      }
    }
    this.activeModuleId = null;
  }

  async destroyAll(): Promise<void> {
    for (const module of this.modules.values()) {
      await module.destroy();
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
