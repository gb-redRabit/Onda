import type {
  IpcPluginGetResult,
  IpcPluginInstallResult,
  IpcPluginUninstallResult,
  PluginExample,
  PluginFetchOptions,
  PluginFetchResult,
  PluginInfo
} from './plugins';

// Kanały wtyczek (wydzielone z byłego `channels-system.ts`).
export interface PluginChannels {
  'plugins:list': { args: []; result: PluginInfo[] };
  'plugins:listExamples': { args: []; result: PluginExample[] };
  'plugins:installExample': { args: [id: string]; result: IpcPluginInstallResult };
  'plugins:get': { args: [id: string]; result: IpcPluginGetResult };
  'plugins:toggle': {
    args: [id: string, enabled: boolean, approvedConsent?: string];
    result: boolean;
  };
  'plugins:uninstall': { args: [id: string]; result: IpcPluginUninstallResult };
  'plugins:installFromFolder': { args: []; result: IpcPluginInstallResult };
  'plugins:storage:keys': { args: [id: string]; result: string[] };
  'plugins:storage:get': { args: [id: string, key: string]; result: unknown };
  'plugins:storage:set': { args: [id: string, key: string, value: unknown]; result: boolean };
  'plugins:storage:remove': { args: [id: string, key: string]; result: boolean };
  'plugins:settings:get': { args: [id: string]; result: Record<string, unknown> };
  'plugins:settings:set': {
    args: [id: string, key: string, value: unknown];
    result: boolean;
  };
  'plugins:fetch': {
    args: [id: string, url: string, opts: PluginFetchOptions];
    result: PluginFetchResult;
  };
}
