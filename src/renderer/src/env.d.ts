/// <reference types="vite/client" />

import type { OndaAPI } from '@shared/ipc/api';

declare global {
  interface Window {
    api: OndaAPI;
  }
}
