import type { AppInfo } from './app';

// Kanały aplikacji, okien, eksploratora i podglądu zdjęć (wydzielone z byłego
// `channels-system.ts`).
export interface AppFactoryResetResult {
  success: boolean;
  error?: string;
}

export interface AppChannels {
  'app:quit': { args: []; result: void };
  'app:getAutoLaunch': { args: []; result: { enabled: boolean; hidden: boolean } };
  'app:setAutoLaunch': { args: [opts: { enabled: boolean; hidden?: boolean }]; result: boolean };
  'app:rendererReady': { args: []; result: void };
  'app:setCloseToTray': { args: [value: boolean]; result: boolean };
  'app:setBackgroundMaterial': { args: [material: string]; result: boolean };
  'app:getPath': { args: [name: string]; result: string };
  'app:readClipboard': { args: []; result: string };
  'app:getPendingFiles': { args: []; result: string[] };
  'app:getInfo': { args: []; result: AppInfo };
  'app:getLicenses': {
    args: [];
    result: Array<{ name: string; version?: string; license?: string }>;
  };
  'app:factoryReset': { args: []; result: AppFactoryResetResult };

  'window:minimize': { args: []; result: void };
  'window:maximize': { args: []; result: void };
  'window:close': { args: []; result: void };
  'window:setAlwaysOnTop': { args: [flag: boolean]; result: void };
  /** Windows 11: true = systemowe zaokrąglenie DWM, false = kwadratowe narożniki. */
  'window:setRoundedCorners': { args: [rounded: boolean]; result: boolean };
  /** Windows 11: kolor 1px obramowania okna (DWM), np. kolor ramki aplikacji. */
  'window:setBorderColor': { args: [color: string]; result: boolean };
  'window:id': { args: []; result: number };
  'window:toggleFullscreen': { args: []; result: boolean };
  'window:exitFullscreen': { args: []; result: void };
  'window:isFullscreen': { args: []; result: boolean };

  'explorer:create': { args: [path?: string]; result: number | null };
  'explorer:tabMoved': { args: [sourceWindowId: number, path: string]; result: void };
  'explorer:sendTabToMain': { args: [path: string]; result: void };

  'imageViewer:open': {
    args: [files: unknown[], index: number];
    result: number | null;
  };
  'imageViewer:getData': {
    args: [];
    result: { files: unknown[]; index: number } | undefined;
  };
  'imageViewer:close': { args: []; result: void };
}
