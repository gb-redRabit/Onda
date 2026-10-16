import type { UpdaterState } from './app';

// Kanały diagnostyki, zależności, aktualizacji i cache (wydzielone z byłego
// `channels-system.ts`), wraz z towarzyszącymi typami wyników.

export type DepSource = 'bundled' | 'managed' | 'system';

export interface IpcWarningEntry {
  at: number;
  text: string;
  count: number;
}

export interface IpcPerfPhase {
  label: string;
  ms: number;
}

export interface IpcPerfProcess {
  type: string;
  workingSetMb: number;
  cpuPercent: number;
}

export interface IpcPerfSnapshot {
  phases: IpcPerfPhase[];
  mainRssMb: number;
  processes: IpcPerfProcess[];
}

export interface DepToolStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
  managed: boolean;
  source: DepSource | null;
  broken: boolean;
  error: string | null;
}

export type DepToolPaths = Array<{
  tool: string;
  path: string | null;
  managed: boolean;
  version: string | null;
  source: DepSource | null;
  broken: boolean;
  error: string | null;
}>;

export interface DepOperationResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
}

export interface AppCacheClearResult {
  success: boolean;
  filesRemoved: number;
  bytesFreed: number;
  error?: string;
}

export interface DiagnosticsChannels {
  'dep:checkFfmpeg': { args: []; result: DepToolStatus };
  'dep:checkYtdlp': { args: []; result: DepToolStatus };
  'dep:checkFfprobe': { args: []; result: DepToolStatus };
  'dep:checkMkvextract': { args: []; result: DepToolStatus };
  'dep:recheck': { args: []; result: boolean };
  'dep:getPaths': { args: []; result: DepToolPaths };
  'dep:checkUpdateYtdlp': {
    args: [];
    result: { updateAvailable: boolean; current: string | null; latest: string | null };
  };
  'dep:installFfmpeg': { args: []; result: DepOperationResult };
  'dep:installYtdlp': { args: []; result: DepOperationResult };
  'dep:installMkvextract': { args: []; result: DepOperationResult };
  'dep:updateYtdlp': { args: []; result: DepOperationResult };
  'dep:removeYtdlp': { args: []; result: DepOperationResult };
  'dep:removeFfmpeg': { args: []; result: DepOperationResult };
  'dep:removeFfprobe': { args: []; result: DepOperationResult };
  'dep:removeMkvextract': { args: []; result: DepOperationResult };
  'dep:cancelInstall': { args: [tool: string]; result: boolean };

  'diagnostics:readLogs': { args: [lines?: number]; result: string };
  'diagnostics:clearLogs': { args: []; result: boolean };
  'diagnostics:getWarnings': { args: []; result: IpcWarningEntry[] };
  'diagnostics:getPerf': { args: []; result: IpcPerfSnapshot };
  'diagnostics:downloadLog': {
    args: [];
    result: { success: boolean; canceled?: boolean; error?: string };
  };

  'updater:getState': { args: []; result: UpdaterState };
  'updater:check': { args: []; result: { checking: boolean } };
  'updater:download': { args: []; result: boolean };
  'updater:install': { args: []; result: void };

  'coverCache:clear': {
    args: [];
    result: { success: boolean; removed?: number; bytesFreed?: number; error?: string };
  };
  'cache:clear': { args: []; result: AppCacheClearResult };
}
