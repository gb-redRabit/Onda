import { shallowRef } from 'vue';
import type { CoreCommand, CoreStateDto, CoreTickDto } from '@shared/types/ipc/channels-core';

// Klient Core dla shelli. Trzyma połączony snapshot: pełny stan struktury
// (`core:state`) + małe ticki pozycji (`core:tick`). Dzięki temu kolejka 500
// utworów nie jedzie przez IPC cztery razy na sekundę.

export const coreState = shallowRef<CoreStateDto | null>(null);
let initialized = false;
let ready = false;
const pendingCommands: CoreCommand[] = [];
const MAX_PENDING_COMMANDS = 100;

function markReady(): void {
  ready = true;
  while (pendingCommands.length) {
    const command = pendingCommands.shift();
    if (command) window.api?.send('core:command', command);
  }
}

function isFullState(value: CoreStateDto | CoreTickDto): value is CoreStateDto {
  return 'current' in value && 'queue' in value;
}

function apply(value: CoreStateDto | CoreTickDto): void {
  markReady();
  const previous = coreState.value;
  if (previous && value.revision < previous.revision) return;
  if (isFullState(value)) {
    coreState.value = value;
    return;
  }
  if (!previous) return;
  coreState.value = { ...previous, ...value };
}

export function initCoreClient(): void {
  if (initialized) return;
  initialized = true;

  window.api?.on('core:state', (raw) => {
    if (raw && typeof raw === 'object') apply(raw as CoreStateDto);
  });
  window.api?.on('core:tick', (raw) => {
    if (raw && typeof raw === 'object') apply(raw as CoreTickDto);
  });

  const hydrate = (): void => {
    void window.api
      ?.invoke('core:getState')
      .then((state) => {
        if (state) apply(state);
      })
      .catch(() => {
        /* Core jeszcze nie gotowy — przyjdzie snapshot */
      });
  };

  window.api?.on('core:ready', () => {
    markReady();
    hydrate();
  });
  hydrate();
  // Gdyby Core był gotowy przed startem shellu, `core:ready` już nie wróci.
  // Pierwszy tick/snapshot i tak odblokuje kolejkę; timeout to bezpiecznik.
  setTimeout(markReady, 5000);
}

export function sendCoreCommand(command: CoreCommand): void {
  if (!ready) {
    if (pendingCommands.length >= MAX_PENDING_COMMANDS) pendingCommands.shift();
    pendingCommands.push(command);
    return;
  }
  window.api?.send('core:command', command);
}
