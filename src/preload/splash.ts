import { ipcRenderer, contextBridge } from 'electron';

contextBridge.exposeInMainWorld('splash', {
  onStatus: (callback: (data: { label: string; progress: number }) => void) => {
    ipcRenderer.on('splash:status', (_event, data) => callback(data));
  }
});
