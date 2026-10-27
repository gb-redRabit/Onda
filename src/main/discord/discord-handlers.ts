import { ipcMain } from 'electron';
import type { PresenceKind, PresenceState } from '../../shared/types/discord';
import { configureDiscord, updatePresence } from './rich-presence';

const KINDS = new Set<PresenceKind>(['audio', 'video', 'stream']);

function optionalText(value: unknown, max = 256): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

function nonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Normalizuje ładunek z renderera — nic nie ufamy jego kształtowi. */
export function sanitizePresence(value: unknown): PresenceState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const kind =
    typeof input.kind === 'string' && KINDS.has(input.kind as PresenceKind)
      ? (input.kind as PresenceKind)
      : 'audio';
  const state: PresenceState = {
    title: optionalText(input.title) ?? 'Unknown',
    kind,
    isPlaying: input.isPlaying === true
  };
  const artist = optionalText(input.artist);
  if (artist) state.artist = artist;
  const album = optionalText(input.album);
  if (album) state.album = album;
  const coverUrl = optionalText(input.coverUrl, 512);
  if (coverUrl && /^https?:\/\//.test(coverUrl)) state.coverUrl = coverUrl;
  const positionSec = nonNegative(input.positionSec);
  if (positionSec !== undefined) state.positionSec = positionSec;
  const durationSec = nonNegative(input.durationSec);
  if (durationSec !== undefined) state.durationSec = durationSec;
  return state;
}

export function registerDiscordHandlers(): void {
  ipcMain.handle('discord:configure', async (_event, options: unknown): Promise<void> => {
    configureDiscord(options);
  });
  ipcMain.on('discord:update', (_event, state: unknown) => {
    updatePresence(sanitizePresence(state));
  });
}
