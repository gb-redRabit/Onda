export interface PluginPermissions {
  storage?: boolean;
  network?: { allow: string[] };
  notifications?: boolean;
  player?: boolean;
  visual?: boolean;
}

export interface PluginSettingField {
  key: string;
  label: string;
  type: 'text' | 'boolean' | 'number';
  default?: unknown;
  min?: number;
  max?: number;
}

export interface PluginLayoutElement {
  element: string;
  variant: string;
  label?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  entry: string;
  apiVersion?: string;
  permissions: PluginPermissions;
  hooks?: string[];
  settings?: PluginSettingField[];
  layoutElements?: PluginLayoutElement[];
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  enabled: boolean;
  permissions: PluginPermissions;
}

/** A plugin bundled with the app and installable from Settings → Plugins. */
export interface PluginExample {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
}

export interface IpcPluginGetResult {
  success: boolean;
  manifest?: PluginManifest;
  code?: string;
  error?: string;
}

export interface IpcPluginUninstallResult {
  success: boolean;
  error?: string;
}

export interface IpcPluginInstallResult {
  success: boolean;
  installed?: PluginInfo;
  error?: string;
}

export interface PluginFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  responseType?: 'text' | 'json';
  timeoutMs?: number;
}

export interface PluginFetchResult {
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  data?: string | unknown;
  error?: string;
  code?:
    'forbidden' | 'invalid-url' | 'network' | 'timeout' | 'too-large' | 'redirect-loop' | 'unknown';
}
