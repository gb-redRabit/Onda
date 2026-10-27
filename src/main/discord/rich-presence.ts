import { logger } from '../../shared/logger';
import type { PresenceState } from '../../shared/types/discord';
import { connectDiscord, type DiscordConnection } from './discord-ipc';
import { buildActivity, type DiscordActivity } from './presence-activity';

const RECONNECT_MS = 15_000;
// Discord limit to ~5 aktualizacji / 20 s — trzymamy się bezpiecznie poniżej.
const MIN_UPDATE_MS = 5_000;
const CLIENT_ID_PATTERN = /^\d{10,25}$/;

let enabled = false;
let clientId = '';
let connection: DiscordConnection | null = null;
let connectPromise: Promise<DiscordConnection | null> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sendTimer: ReturnType<typeof setTimeout> | null = null;
let lastState: PresenceState | null = null;
let lastSentAt = 0;
let lastFingerprint = '';
let shuttingDown = false;

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sendTimer) {
    clearTimeout(sendTimer);
    sendTimer = null;
  }
  if (connection) {
    connection.onClose = undefined;
    connection.close();
    connection = null;
  }
  connectPromise = null;
  lastFingerprint = '';
}

function scheduleReconnect(): void {
  if (!enabled || shuttingDown || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!enabled) return;
    void ensureConnected().then((conn) => {
      if (conn && lastState) updatePresence(lastState);
    });
  }, RECONNECT_MS);
}

function ensureConnected(): Promise<DiscordConnection | null> {
  if (connection) return Promise.resolve(connection);
  if (connectPromise) return connectPromise;
  if (!enabled || shuttingDown) return Promise.resolve(null);
  connectPromise = (async () => {
    try {
      const conn = await connectDiscord(clientId);
      conn.onClose = () => {
        connection = null;
        scheduleReconnect();
      };
      connection = conn;
      return conn;
    } catch (error) {
      logger.info('discord', `rich presence connect failed: ${errMsg(error)}`);
      scheduleReconnect();
      return null;
    } finally {
      connectPromise = null;
    }
  })();
  return connectPromise;
}

async function sendActivity(activity: DiscordActivity | null): Promise<void> {
  if (!enabled || shuttingDown) return;
  const conn = await ensureConnected();
  if (!conn) return;
  if (activity) conn.setActivity(activity);
  else conn.clearActivity();
  lastSentAt = Date.now();
}

function scheduleSend(activity: DiscordActivity | null): void {
  const now = Date.now();
  const wait = Math.max(0, MIN_UPDATE_MS - (now - lastSentAt));
  if (sendTimer) clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    sendTimer = null;
    void sendActivity(activity);
  }, wait);
}

export function configureDiscord(options: unknown): void {
  const input =
    options && typeof options === 'object' && !Array.isArray(options)
      ? (options as { enabled?: unknown; clientId?: unknown })
      : {};
  const nextClientId = typeof input.clientId === 'string' ? input.clientId.trim() : '';
  const nextEnabled = input.enabled === true && CLIENT_ID_PATTERN.test(nextClientId);
  if (nextEnabled === enabled && nextClientId === clientId) return;
  enabled = nextEnabled;
  clientId = nextClientId;
  if (!enabled) {
    // Zamknięcie połączenia czyści presence po stronie Discorda.
    disconnect();
    return;
  }
  void ensureConnected().then(() => {
    if (lastState) updatePresence(lastState);
  });
}

export function updatePresence(state: PresenceState | null): void {
  lastState = state;
  if (!enabled || shuttingDown) return;

  const activity = buildActivity(state);
  if (!activity) {
    if (lastFingerprint === 'none') return;
    lastFingerprint = 'none';
    scheduleSend(null);
    return;
  }

  // Pozycja co 10 s odświeża pasek i łapie seki; reszta pól natychmiast.
  const fingerprint = [
    state?.title ?? '',
    state?.artist ?? '',
    state?.album ?? '',
    state?.kind ?? '',
    Math.floor((state?.positionSec ?? 0) / 10)
  ].join('|');
  if (fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;
  scheduleSend(activity);
}

export function shutdownDiscord(): void {
  enabled = false;
  shuttingDown = true;
  disconnect();
}
