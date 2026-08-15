import { ref } from 'vue';
import type { IpcDownloadProfile, IpcDownloadConfig } from '@shared/types/ipc';

const profiles = ref<IpcDownloadProfile[]>([]);
let initialized = false;

// Shared download-profile state (saved in `download-profiles.json` via IPC).
export function useDownloadProfiles() {
  async function load(): Promise<void> {
    try {
      profiles.value = (await window.api.invoke('profiles:list')) as IpcDownloadProfile[];
    } catch {
      profiles.value = [];
    }
  }

  async function save(name: string, config: IpcDownloadConfig, id?: string): Promise<void> {
    try {
      const list = (await window.api.invoke(
        'profiles:save',
        id ? { id, name, config } : { name, config }
      )) as IpcDownloadProfile[] | null;
      if (list) profiles.value = list;
    } catch {
      /* save failed */
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      profiles.value = (await window.api.invoke('profiles:delete', id)) as IpcDownloadProfile[];
    } catch {
      /* delete failed */
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!initialized) {
      initialized = true;
      await load();
    }
  }

  return { profiles, load, save, remove, ensureLoaded };
}
