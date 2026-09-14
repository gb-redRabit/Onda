import type { Ref } from 'vue';
import type { PluginManifest } from '@shared/types/ipc';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryStore } from '@renderer/stores/library';
import { useUIStore } from '@renderer/stores/ui';
import {
  ELEMENT_DECORATIONS,
  PLUGIN_HOST_VARIANTS,
  PLUGIN_VISUAL_KEY,
  snapshotTrack
} from '@renderer/utils/plugins-helpers';

const NOTIFY_TYPES = ['info', 'success', 'warning', 'error'] as const;

export interface PluginApiDeps {
  getManifest: (id: string) => PluginManifest | undefined;
  getSettings: (id: string) => Record<string, unknown>;
  saveSetting: (id: string, key: string, value: unknown) => Promise<boolean>;
  visuals: Ref<Record<string, Record<string, string>>>;
}

export type PluginApiDispatch = (op: string, args: unknown[], pluginId: string) => Promise<unknown>;

/**
 * Routes the sandboxed plugin `api.*` calls coming from `pluginWorker` to host
 * capabilities. Owned by `stores/plugins.ts`, which provides manifest/settings
 * accessors, the visuals ref and the settings writer.
 */
export function createPluginApi(deps: PluginApiDeps): PluginApiDispatch {
  const { getManifest, getSettings, saveSetting, visuals } = deps;

  function hasPermission(
    id: string,
    perm: 'storage' | 'notifications' | 'player' | 'visual'
  ): boolean {
    return getManifest(id)?.permissions[perm] === true;
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
      const manifest = getManifest(pluginId);
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

  return async function dispatchApi(
    op: string,
    args: unknown[],
    pluginId: string
  ): Promise<unknown> {
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
        return getSettings(pluginId)[String(args[0] ?? '')] ?? null;
      case 'settings:set': {
        const key = String(args[0] ?? '');
        if (!getManifest(pluginId)?.settings?.some((f) => f.key === key))
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
  };
}
