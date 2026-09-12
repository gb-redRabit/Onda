import { defineStore } from 'pinia';
import { ref, computed, shallowRef } from 'vue';
import type {
  PluginInfo,
  PluginManifest,
  PluginSettingField,
  IpcPluginInstallResult
} from '@shared/types/ipc';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from './player';
import { useLibraryStore } from './library';
import { useUIStore } from './ui';
import type { PluginCommandEntry, PluginHookPayload } from '@renderer/modules/plugins/plugin-shim';
import type { AudioLayoutElementId } from '@renderer/types/settings';
import { isKnownHook } from '@renderer/utils/pluginHooks';
import {
  createPluginWorker,
  type PluginWorkerHandle
} from '@renderer/modules/plugins/pluginWorker';
import { logger } from '@shared/logger';

export type PluginUiStatus = 'new' | 'loading' | 'loaded' | 'error';

export interface PluginUiInfo extends PluginInfo {
  status: PluginUiStatus;
  error?: string;
}

const NOTIFY_TYPES = ['info', 'success', 'warning', 'error'] as const;
const MAX_LOG_LINES = 50;

export const ELEMENT_DECORATIONS: Record<string, string[]> = {
  cover: ['none', 'triangle', 'circle', 'diamond', 'hexagon'],
  visualization: ['none', 'outline', 'glow', 'glass'],
  progress: ['none', 'glow', 'neon'],
  trackInfo: ['none', 'badge', 'glass', 'glow'],
  controls: ['none', 'glass', 'glow']
};

/**
 * Host-renderowane warianty deklarowane przez wtyczki (rozszerzenie dekoracji).
 * Wartość w dekoracji zapisuje się jako `plugin:<element>:<variant>`. Host zna tylko
 * te warianty, więc pluginowy wariant spoza tej mapy w edytorze się pokaże, ale nie
 * nada żadnego stylu (bezpieczny fallback). Pierwszy wpis = wariant hosta, który łączy
 * się z elementem za pomocą klasy/clip-path.
 */
export const PLUGIN_HOST_VARIANTS: Record<string, Record<string, string>> = {
  cover: {
    'flip-x': 'plugin-cover-flip-x'
  }
};

const PLUGIN_VISUAL_KEY = 'element.decoration';

export interface TrackSnapshot {
  id: string;
  path: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  isOnline: boolean;
  platform?: string;
}

export function snapshotTrack(track: MediaFile | null): TrackSnapshot | null {
  if (!track) return null;
  const title = track.metadata?.title || track.name;
  return {
    id: track.id,
    path: track.path,
    title,
    artist: track.metadata?.artist,
    album: track.metadata?.album,
    duration: track.metadata?.duration ?? track.duration,
    isOnline: track.type === 'stream'
  };
}

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<PluginUiInfo[]>([]);
  const commands = ref<PluginCommandEntry[]>([]);
  const logs = ref<Record<string, string[]>>({});
  const loading = ref(false);
  const visuals = ref<Record<string, Record<string, string>>>({});
  const pluginSettings = ref<Record<string, Record<string, unknown>>>({});

  const manifests = ref<Record<string, PluginManifest>>({});
  const workers = shallowRef<Record<string, PluginWorkerHandle>>({});
  const readyWorkers = new Set<string>();

  const decorations = computed<Partial<Record<AudioLayoutElementId, string>>>(() => {
    const out: Partial<Record<AudioLayoutElementId, string>> = {};
    for (const elementId of Object.keys(ELEMENT_DECORATIONS)) {
      for (const p of plugins.value) {
        if (!p.enabled) continue;
        const value = visuals.value[p.id]?.[elementId];
        if (value && value !== 'none') {
          out[elementId as AudioLayoutElementId] = value;
          break;
        }
      }
    }
    return out;
  });

  const layoutVariants = computed<
    Record<string, { value: string; label: string; plugin: string }[]>
  >(() => {
    const out: Record<string, { value: string; label: string; plugin: string }[]> = {};
    for (const p of plugins.value) {
      if (!p.enabled) continue;
      const manifest = manifests.value[p.id];
      if (!manifest || manifest.permissions.visual !== true || !manifest.layoutElements) continue;
      for (const le of manifest.layoutElements) {
        if (!PLUGIN_HOST_VARIANTS[le.element]?.[le.variant]) continue;
        const key = `plugin:${le.element}:${le.variant}`;
        const list = out[le.element] || (out[le.element] = []);
        if (!list.some((v) => v.value === key)) {
          list.push({ value: key, label: le.label || le.variant, plugin: p.name });
        }
      }
    }
    return out;
  });

  function logPush(id: string, line: string): void {
    let list = logs.value[id];
    if (!list) {
      list = [];
      logs.value = { ...logs.value, [id]: list };
    }
    list.push(line);
    if (list.length > MAX_LOG_LINES) list.splice(0, list.length - MAX_LOG_LINES);
  }

  function setStatus(id: string, status: PluginUiStatus, error?: string): void {
    plugins.value = plugins.value.map((p) => (p.id === id ? { ...p, status, error } : p));
  }

  function manifestOf(id: string): PluginManifest | undefined {
    return manifests.value[id];
  }

  function settingsOf(id: string): Record<string, unknown> {
    const stored = pluginSettings.value[id] || {};
    const fields = manifestOf(id)?.settings || [];
    const out: Record<string, unknown> = { ...stored };
    for (const field of fields) {
      if (field.default !== undefined && out[field.key] === undefined) {
        out[field.key] = field.default;
      }
    }
    return out;
  }

  async function saveSetting(id: string, key: string, value: unknown): Promise<boolean> {
    const ok = await window.api.pluginsSettingsSet(id, key, value);
    if (ok) {
      pluginSettings.value = {
        ...pluginSettings.value,
        [id]: { ...(pluginSettings.value[id] || {}), [key]: value }
      };
    }
    return ok;
  }

  function settingFields(id: string): PluginSettingField[] {
    return manifestOf(id)?.settings || [];
  }

  function hasPermission(
    id: string,
    perm: 'storage' | 'notifications' | 'player' | 'visual'
  ): boolean {
    return manifestOf(id)?.permissions[perm] === true;
  }

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const list = (await window.api.pluginsList()) || [];
      manifests.value = {};
      workers.value = {};
      readyWorkers.clear();
      commands.value = [];
      visuals.value = {};
      plugins.value = list.map((p) => ({ ...p, status: 'new' as PluginUiStatus }));
      logs.value = {};
      pluginSettings.value = {};
      const fetchedSettings = await Promise.all(
        list.map(async (plugin) => {
          let value: Record<string, unknown> = {};
          try {
            value = (await window.api.pluginsSettingsGet(plugin.id)) || {};
          } catch {
            value = {};
          }
          return [plugin.id, value] as const;
        })
      );
      pluginSettings.value = {};
      for (const [id, value] of fetchedSettings) {
        pluginSettings.value[id] = value;
      }
      for (const plugin of list) {
        if (plugin.enabled) {
          await spawnPlugin(plugin.id);
        }
      }
      readyWorkers.forEach(() => undefined);
      emitHook('app:start', {});
    } catch (e) {
      logger.error('plugins', 'plugins.load failed', e);
    } finally {
      loading.value = false;
    }
  }

  async function spawnPlugin(id: string): Promise<void> {
    const manifest = manifests.value[id];
    if (!manifest) {
      const result = await window.api.pluginsGet(id);
      if (!result.success || !result.manifest || !result.code) {
        setStatus(id, 'error', result.error || 'manifest-missing');
        return;
      }
      manifests.value = { ...manifests.value, [id]: result.manifest };
      return spawnPluginWithCode(id, result.code, result.manifest);
    }
    const result = await window.api.pluginsGet(id);
    if (!result.success || !result.code) {
      setStatus(id, 'error', result.error || 'entry-missing');
      return;
    }
    spawnPluginWithCode(id, result.code, manifest);
  }

  function validateShortcut(shortcut: string | undefined): boolean {
    if (!shortcut) return true;
    const parts = shortcut.split('+').map((p) => p.trim());
    if (parts.length < 2) return false;
    const modifiers = parts.slice(0, -1);
    const key = parts[parts.length - 1];
    if (modifiers.length === 0) return false;
    if (modifiers.some((m) => !['Ctrl', 'Meta', 'Alt', 'Shift'].includes(m))) return false;
    if (!/^[A-Z0-9]|^(F\d{1,2}|Media\w+)$/i.test(key)) return false;
    const seen = new Set<string>();
    return modifiers.every((m) => (seen.has(m) ? false : (seen.add(m), true)));
  }

  function shortcutTakenBy(shortcut: string): string | null {
    return commands.value.find((c) => c.shortcut === shortcut)?.id ?? null;
  }

  function spawnPluginWithCode(id: string, code: string, _manifest: PluginManifest): void {
    if (workers.value[id]) return;
    setStatus(id, 'loading');
    const pluginId = id;
    const handle = createPluginWorker({
      id,
      code,
      onReady() {
        readyWorkers.add(pluginId);
        setStatus(pluginId, 'loaded');
      },
      onCommand(command) {
        if (!command || typeof command.id !== 'string') return;
        if (
          !commands.value.some(
            (c) => c.id === command.id && (c as { pluginId?: string }).pluginId === pluginId
          )
        ) {
          let next = { ...command, pluginId } as PluginCommandEntry & { pluginId: string };
          if (command.shortcut && !validateShortcut(command.shortcut)) {
            logPush(
              pluginId,
              `[warn] shortcut '${command.shortcut}' odrzucony (nieprawidłowy format)`
            );
            next = { ...next, shortcut: undefined };
          } else if (command.shortcut && shortcutTakenBy(command.shortcut)) {
            logPush(
              pluginId,
              `[warn] shortcut '${command.shortcut}' pominięty (konflikt z inną komendą)`
            );
            next = { ...next, shortcut: undefined };
          }
          commands.value.push(next);
        }
      },
      onCommandRemoved(commandId) {
        commands.value = commands.value.filter(
          (c) => !(c.id === commandId && (c as { pluginId?: string }).pluginId === pluginId)
        );
      },
      onLog(level, message) {
        logPush(pluginId, `[${level}] ${message}`);
      },
      onError(message) {
        logPush(pluginId, `[error] ${message}`);
        setStatus(pluginId, 'error', message);
      },
      async apiDispatch(op, args) {
        return dispatchApi(op, args, pluginId);
      }
    });
    workers.value = { ...workers.value, [id]: handle };
  }

  async function toggle(id: string): Promise<void> {
    const info = plugins.value.find((p) => p.id === id);
    const enabled = info ? !info.enabled : false;
    const ok = await window.api.pluginsToggle(id, enabled);
    if (!ok) return;
    if (enabled) {
      plugins.value = plugins.value.map((p) =>
        p.id === id ? { ...p, enabled: true, status: 'new' } : p
      );
      await spawnPlugin(id);
    } else {
      terminatePlugin(id, false);
      plugins.value = plugins.value.map((p) =>
        p.id === id ? { ...p, enabled: false, status: 'new' } : p
      );
    }
  }

  function terminatePlugin(id: string, removeCommands: boolean): void {
    const handle = workers.value[id];
    if (handle) {
      handle.terminate();
      const next = { ...workers.value };
      delete next[id];
      workers.value = next;
    }
    readyWorkers.delete(id);
    if (removeCommands) {
      commands.value = commands.value.filter((c) => (c as { pluginId?: string }).pluginId !== id);
    }
    if (visuals.value[id]) {
      const next = { ...visuals.value };
      delete next[id];
      visuals.value = next;
    }
    if (pluginSettings.value[id]) {
      const next = { ...pluginSettings.value };
      delete next[id];
      pluginSettings.value = next;
    }
  }

  async function uninstall(id: string): Promise<void> {
    const result = await window.api.pluginsUninstall(id);
    if (!result.success) return;
    terminatePlugin(id, true);
    plugins.value = plugins.value.filter((p) => p.id !== id);
    readyWorkers.delete(id);
  }

  async function installFromFolder(): Promise<IpcPluginInstallResult> {
    const result = await window.api.pluginsInstallFromFolder();
    if (result.success && result.installed) {
      await load();
    }
    return result;
  }

  async function refresh(): Promise<void> {
    for (const id of Object.keys(workers.value)) terminatePlugin(id, true);
    await load();
  }

  function emitHook(name: string, payload: PluginHookPayload): void {
    if (!isKnownHook(name)) return;
    const list = Object.entries(workers.value);
    for (const [id, handle] of list) {
      if (!readyWorkers.has(id)) continue;
      try {
        handle.postHook(name, payload);
      } catch (e) {
        logPush(id, `[error] hook ${name} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  function commandsIn(location: string): PluginCommandEntry[] {
    return commands.value.filter((c) => (c as { location?: string }).location === location);
  }

  function findCommandByShortcut(
    shortcut: string
  ): (PluginCommandEntry & { pluginId?: string }) | undefined {
    return commands.value.find((c) => c.shortcut === shortcut);
  }

  function dispatchShortcut(shortcut: string): boolean {
    const cmd = findCommandByShortcut(shortcut);
    if (!cmd) return false;
    dispatchCommand(cmd.id);
    return true;
  }

  function dispatchCommand(commandId: string, payload?: PluginHookPayload): void {
    const cmd = commands.value.find((c) => c.id === commandId) as
      (PluginCommandEntry & { pluginId?: string }) | undefined;
    if (!cmd || !cmd.pluginId) return;
    const handle = workers.value[cmd.pluginId];
    if (!handle || !readyWorkers.has(cmd.pluginId)) return;
    try {
      handle.postInvokeCommand(commandId, payload);
    } catch (e) {
      logPush(
        cmd.pluginId,
        `[error] invoke-command failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  function invokeCommandWithContext(commandId: string, payload: PluginHookPayload): void {
    dispatchCommand(commandId, payload);
  }

  async function dispatchApi(op: string, args: unknown[], pluginId: string): Promise<unknown> {
    switch (op) {
      case 'query':
        return dispatchQuery(args, pluginId);
      case 'action':
        return dispatchAction(args, pluginId);
      case 'storage:keys':
        return window.api.pluginsStorageKeys(pluginId);
      case 'storage:get':
        return window.api.pluginsStorageGet(pluginId, String(args[0] ?? ''));
      case 'storage:set':
        return window.api.pluginsStorageSet(pluginId, String(args[0] ?? ''), args[1]);
      case 'storage:remove':
        return window.api.pluginsStorageRemove(pluginId, String(args[0] ?? ''));
      case 'settings:get':
        return settingsOf(pluginId)[String(args[0] ?? '')] ?? null;
      case 'settings:set': {
        const key = String(args[0] ?? '');
        if (!manifestOf(pluginId)?.settings?.some((f) => f.key === key))
          throw new Error('setting-unknown');
        return saveSetting(pluginId, key, args[1]);
      }
      case 'fetch':
        return dispatchFetch(pluginId, args);
      case 'ui:set':
        return dispatchVisual(args, pluginId);
      default:
        throw new Error('unknown-op');
    }
  }

  function dispatchQuery(args: unknown[], _pluginId: string): Promise<unknown> | unknown {
    const name = String(args[0] ?? '');
    const qargs =
      args[1] && typeof args[1] === 'object' ? (args[1] as Record<string, unknown>) : {};
    switch (name) {
      case 'player:status':
        return playerStatus();
      case 'library:count':
        return libraryCount();
      case 'library:search':
        return librarySearch(String(qargs.query ?? ''), Number(qargs.limit) || 30);
      default:
        throw new Error('unknown-query');
    }
  }

  function playerStatus(): unknown {
    const player = usePlayerStore();
    return {
      currentTrack: snapshotTrack(player.currentTrack),
      isPlaying: player.isPlaying,
      volume: player.volume,
      shuffle: player.shuffle,
      repeat: player.repeat,
      queueLength: player.queueLength
    };
  }

  function libraryCount(): unknown {
    const library = useLibraryStore();
    return {
      tracks: library.tracks.length,
      audio: library.audioCount,
      playlists: library.playlists.length
    };
  }

  function librarySearch(query: string, limit: number): unknown {
    const library = useLibraryStore();
    const cap = Math.max(1, Math.min(30, Math.floor(limit) || 30));
    const results = query ? library.search(query) : library.tracks.slice(0, cap);
    return {
      tracks: results.slice(0, cap).map((t) => {
        const snap = snapshotTrack(t);
        return snap
          ? {
              path: snap.path,
              title: snap.title,
              artist: snap.artist,
              album: snap.album,
              duration: snap.duration
            }
          : null;
      })
    };
  }

  function dispatchAction(args: unknown[], pluginId: string): Promise<unknown> | unknown {
    const name = String(args[0] ?? '');
    const aargs =
      args[1] && typeof args[1] === 'object' ? (args[1] as Record<string, unknown>) : {};
    const player = usePlayerStore();
    if (name.startsWith('player:')) {
      if (!hasPermission(pluginId, 'player')) throw new Error('permission-denied:player');
      switch (name) {
        case 'player:play':
          player.play();
          return true;
        case 'player:pause':
          player.pause();
          return true;
        case 'player:toggle':
          player.togglePlay();
          return true;
        case 'player:next':
          player.nextTrack();
          return true;
        case 'player:previous':
          player.prevTrack();
          return true;
        case 'player:setVolume': {
          const v = Number(aargs.volume);
          if (Number.isFinite(v)) player.setVolume(Math.max(0, Math.min(1, v)));
          return true;
        }
        case 'player:seek': {
          const s = Number(aargs.seconds);
          if (Number.isFinite(s) && s >= 0) player.seek(s);
          return true;
        }
        case 'player:enqueue': {
          const list = Array.isArray(aargs.tracks) ? aargs.tracks.map(String) : [];
          const library = useLibraryStore();
          const found = list
            .map((p) => library.tracks.find((t) => t.path === p))
            .filter((t): t is MediaFile => !!t);
          if (found.length) player.addToQueueMultiple(found);
          return found.length;
        }
        default:
          throw new Error('unknown-action');
      }
    }
    if (name === 'track:toggleFavorite') {
      if (!hasPermission(pluginId, 'player')) throw new Error('permission-denied:player');
      const path = String(aargs.path ?? '');
      if (!path) throw new Error('track:path-required');
      return player.toggleFavorite(path).then(() => true);
    }
    if (name === 'notify') {
      if (!hasPermission(pluginId, 'notifications'))
        throw new Error('permission-denied:notifications');
      const type = NOTIFY_TYPES.includes(aargs.type as (typeof NOTIFY_TYPES)[number])
        ? (aargs.type as (typeof NOTIFY_TYPES)[number])
        : 'info';
      const title = String(aargs.title ?? '');
      if (!title) throw new Error('notify:missing-title');
      const message = typeof aargs.message === 'string' ? aargs.message : undefined;
      useUIStore().notify(type, title, message);
      return true;
    }
    throw new Error('unknown-action');
  }

  function dispatchVisual(args: unknown[], pluginId: string): boolean {
    if (!hasPermission(pluginId, 'visual')) throw new Error('permission-denied:visual');
    const key = String(args[0] ?? '');
    if (key !== PLUGIN_VISUAL_KEY) throw new Error('unknown-visual-key');
    const payload =
      args[1] && typeof args[1] === 'object' ? (args[1] as Record<string, unknown>) : {};
    const element = String(payload.element ?? '');
    const value = String(payload.value ?? '');
    const options = ELEMENT_DECORATIONS[element];
    const pluginVariant = value.startsWith('plugin:');
    if (!options && !pluginVariant) throw new Error('unknown-visual-element');
    if (!pluginVariant && !options.includes(value)) throw new Error('unknown-decoration');
    if (pluginVariant) {
      const parts = value.split(':');
      if (parts.length !== 3 || parts[0] !== 'plugin') throw new Error('unknown-decoration');
      const [_, rawElement, variant] = parts;
      if (rawElement !== element) throw new Error('unknown-decoration');
      const manifest = manifests.value[pluginId];
      const declared =
        manifest?.permissions.visual === true &&
        manifest.layoutElements?.some((le) => le.element === element && le.variant === variant);
      if (!declared || !PLUGIN_HOST_VARIANTS[element]?.[variant])
        throw new Error('unknown-decoration');
    }
    const next = { ...(visuals.value[pluginId] || {}) };
    if (value === 'none') delete next[element];
    else next[element] = value;
    visuals.value = { ...visuals.value, [pluginId]: next };
    return true;
  }

  async function dispatchFetch(pluginId: string, args: unknown[]): Promise<unknown> {
    const url = String(args[0] ?? '');
    const opts = args[1] && typeof args[1] === 'object' ? (args[1] as Record<string, unknown>) : {};
    const result = await window.api.pluginsFetch(pluginId, url, {
      method: opts.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined,
      headers: opts.headers as Record<string, string> | undefined,
      body: opts.body,
      responseType: opts.responseType === 'json' ? 'json' : 'text',
      timeoutMs: typeof opts.timeoutMs === 'number' ? opts.timeoutMs : undefined
    });
    if (!result.success) {
      const err = new Error(result.error || 'fetch-failed');
      (err as { code?: string }).code = result.code;
      throw err;
    }
    return {
      ok: result.status !== undefined && result.status >= 200 && result.status < 300,
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      data: result.data
    };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      for (const handle of Object.values(workers.value)) {
        try {
          handle.terminate();
        } catch {
          /* ignore */
        }
      }
      workers.value = {};
    });
  }

  return {
    plugins,
    commands,
    logs,
    visuals,
    decorations,
    layoutVariants,
    pluginSettings,
    loading,
    load,
    toggle,
    uninstall,
    installFromFolder,
    refresh,
    emitHook,
    dispatchCommand,
    dispatchShortcut,
    commandsIn,
    invokeCommandWithContext,
    dispatchApi,
    settingsOf,
    saveSetting,
    settingFields
  };
});
