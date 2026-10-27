import type { CoreCommand, CoreStateDto } from '@shared/types/ipc/channels-core';
import type { MediaFile } from '@shared/types/media';

// Testowy shell spike'u. Nie jest częścią docelowego compactu — służy tylko do
// sprawdzenia, że ukryty Core odtwarza audio i publikuje stan przez IPC.

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

const statusEl = byId<HTMLSpanElement>('core-status');
const titleEl = byId<HTMLDivElement>('title');
const artistEl = byId<HTMLDivElement>('artist');
const barEl = byId<HTMLDivElement>('bar');
const timeEl = byId<HTMLSpanElement>('time');
const durationEl = byId<HTMLSpanElement>('duration');
const revisionEl = byId<HTMLSpanElement>('revision');
const playingEl = byId<HTMLSpanElement>('playing');
const loadingEl = byId<HTMLSpanElement>('loading');
const errorEl = byId<HTMLSpanElement>('error');
const pathEl = byId<HTMLSpanElement>('path');
const playButton = byId<HTMLButtonElement>('play');
const librarySelect = byId<HTMLSelectElement>('library');
const logEl = byId<HTMLPreElement>('log');

let current: CoreStateDto | null = null;
let libraryTracks: MediaFile[] = [];

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function log(message: string): void {
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `${time}  ${message}\n${logEl.textContent ?? ''}`;
}

function send(command: CoreCommand): void {
  window.api.send('core:command', command);
  log(`→ ${command.type}`);
}

function render(state: CoreStateDto): void {
  current = state;
  if (statusEl.textContent === 'łączenie…') setCoreStatus('Core gotowy', 'ok');
  const track = state.current;
  titleEl.textContent = track?.metadata?.title || track?.name || 'Nic nie gra';
  artistEl.textContent = track?.metadata?.artist || '—';
  pathEl.textContent = track?.path || '—';

  const ratio = state.duration > 0 ? Math.min(1, state.currentTime / state.duration) : 0;
  barEl.style.width = `${Math.round(ratio * 100)}%`;
  timeEl.textContent = formatTime(state.currentTime);
  durationEl.textContent = formatTime(state.duration);
  revisionEl.textContent = `rewizja ${state.revision}`;
  playButton.textContent = state.isPlaying ? '⏸' : '▶';
  playingEl.textContent = `${state.isPlaying} / ${state.enginePlaying}`;
  playingEl.className = state.enginePlaying ? 'ok' : 'muted';
  loadingEl.textContent = String(state.isLoading);
  errorEl.textContent = state.error ?? '—';
  errorEl.className = state.error ? 'bad' : 'muted';
}

function setCoreStatus(text: string, kind: 'ok' | 'bad' | 'idle'): void {
  statusEl.textContent = text;
  statusEl.className = `badge ${kind === 'idle' ? '' : kind}`;
}

async function loadLibrary(): Promise<void> {
  try {
    const chunk = await window.api.invoke('library:loadScannedChunk', 0, 2000);
    if (!chunk) {
      log('biblioteka jest pusta');
      return;
    }
    libraryTracks = chunk.files.filter((track) => track.type === 'audio').slice(0, 200);
    librarySelect.textContent = '';
    for (const track of libraryTracks) {
      const option = document.createElement('option');
      option.value = track.path;
      option.textContent = track.name;
      option.title = track.path;
      librarySelect.append(option);
    }
    log(`wczytano ${libraryTracks.length} utworów audio (z ${chunk.total} plików)`);
    if (!libraryTracks.length) log('brak utworów audio w pierwszym wycinku biblioteki');
  } catch (error) {
    log(`błąd biblioteki: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function openFile(): Promise<void> {
  try {
    const result = await window.api.invoke('dialog:openFile', {
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'] }]
    });
    if (result.canceled || !result.filePaths[0]) return;
    const filePath = result.filePaths[0];
    const name = filePath.split(/[\\/]/).pop() || filePath;
    const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
    const track: MediaFile = {
      id: filePath,
      name,
      path: filePath,
      extension,
      mimeType: `audio/${extension || 'mpeg'}`,
      size: 0,
      type: 'audio',
      addedAt: Date.now(),
      playCount: 0
    };
    send({ type: 'load', track, autoplay: true });
  } catch (error) {
    log(`błąd otwierania pliku: ${error instanceof Error ? error.message : String(error)}`);
  }
}

playButton.addEventListener('click', () => send({ type: 'toggle' }));
byId<HTMLButtonElement>('prev').addEventListener('click', () => send({ type: 'prev' }));
byId<HTMLButtonElement>('next').addEventListener('click', () => send({ type: 'next' }));
byId<HTMLButtonElement>('back10').addEventListener('click', () => {
  const time = Math.max(0, (current?.currentTime ?? 0) - 10);
  send({ type: 'seek', time });
});
byId<HTMLButtonElement>('fwd10').addEventListener('click', () => {
  const time = (current?.currentTime ?? 0) + 10;
  send({ type: 'seek', time });
});
byId<HTMLButtonElement>('volDown').addEventListener('click', () => {
  send({ type: 'setVolume', value: Math.max(0, (current?.volume ?? 0.8) - 0.1) });
});
byId<HTMLButtonElement>('volUp').addEventListener('click', () => {
  send({ type: 'setVolume', value: Math.min(1, (current?.volume ?? 0.8) + 0.1) });
});
byId<HTMLButtonElement>('load-library').addEventListener('click', () => void loadLibrary());
byId<HTMLButtonElement>('play-selected').addEventListener('click', () => {
  const track = libraryTracks.find((item) => item.path === librarySelect.value);
  if (!track) {
    log('najpierw wczytaj bibliotekę i wybierz utwór');
    return;
  }
  send({ type: 'load', track, autoplay: true });
});
byId<HTMLButtonElement>('open-file').addEventListener('click', () => void openFile());

window.api.on('core:state', (raw) => {
  render(raw as CoreStateDto);
});
window.api.on('core:ready', () => {
  setCoreStatus('Core gotowy', 'ok');
  log('Core zgłosił gotowość');
});
window.api.on('core:error', (raw) => {
  setCoreStatus('Błąd Core', 'bad');
  log(`Core error: ${String(raw)}`);
});

void window.api
  .invoke('core:getState')
  .then((state) => {
    if (state) render(state);
    else log('brak zapisanego stanu Core');
  })
  .catch((error) => log(`getState: ${error instanceof Error ? error.message : String(error)}`));

log('shell gotowy');
