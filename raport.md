# Raport analizy projektu Onda

## Spis treści
1. [Podsumowanie](#1-podsumowanie)
2. [Problemy wydajnościowe](#2-problemy-wydajnościowe)
3. [Problemy stabilności](#3-problemy-stabilności)
4. [Problemy architektury i modułowości](#4-problemy-architektury-i-modułowości)
5. [Problemy jakości kodu](#5-problemy-jakości-kodu)
6. [Martwy kod i placeholder](#6-martwy-kod-i-placeholder)
7. [Plan naprawczy — krok po kroku](#7-plan-naprawczy--krok-po-kroku)
8. [Szacowany wpływ](#8-szacowany-wpływ)

---

## 1. Podsumowanie

Onda to nowoczesny odtwarzacz multimedialny zbudowany na Electron + Vue 3 + TypeScript + Pinia. Projekt ma **solidną architekturę modułową** z ModuleManagerem, ale cierpi na szereg problemów wydajnościowych, stabilnościowych i jakościowych. Główne problemy:

| Kategoria | Liczba problemów | Priorytet |
|-----------|-----------------|-----------|
| Wydajność | 12 | Wysoki |
| Stabilność | 10 | Wysoki |
| Architektura | 8 | Średni |
| Jakość kodu | 9 | Średni |
| Martwy kod | 6 | Niski |

---

## 2. Problemy wydajnościowe

### P2.1 — `electron-store` dynamicznie importowany przy każdym odczycie/zapisie

**Plik:** `src/main/ipc/handlers.ts:349-370`

Handler `settings:get` i `settings:set` każdorazowo wykonują `await import('electron-store')`. Dynamiczny import jest kosztowny (kilka ms na każde wywołanie), a settings są odczytywane przy starcie i zapisywane przy każdej zmianie slidera (setki razy).

**Fix:** Zaimportuj `electron-store` statycznie na górze pliku.

```typescript
// handlers.ts — linia 1
import Store from 'electron-store';
const store = new Store();
```

Następnie w handlerach:
```typescript
ipcMain.handle('settings:get', async () => store.store || {});
ipcMain.handle('settings:set', async (_event, data) => {
  for (const [key, value] of Object.entries(data)) store.set(key, value);
  return true;
});
```

### P2.2 — Zapis ustawień przy każdej zmianie slidera (write storm)

**Plik:** `src/renderer/src/stores/settings.ts:62-75`

Każda zmiana `fontSize`, `crossfadeDuration`, `defaultVolume`, `pipWidth` itp. wywołuje `save()` → `window.api.invoke('settings:set', ...)` → IPC → zapis pliku JSON na dysku. Przy przeciąganiu slidera generuje to dziesiątki zapisów na sekundę.

**Fix:** Dodaj debounce w store settings:

```typescript
// settings.ts
import { debounce } from '@vueuse/core'; // już dostępne jako zależność

const save = debounce(async () => {
  // ... istniejąca logika
}, 300);

function updateAppearance(partial: Partial<AppearanceSettings>) {
  Object.assign(appearance.value, partial);
  save(); // teraz debounced
}
```

### P2.3 — `execSync` w main process blokuje event loop

**Plik:** `src/main/ipc/handlers.ts` — `dep:checkFfmpeg` (linia 431), `dep:checkYtdlp` (linia 445), `dep:checkFfprobe` (linia 471), `dep:checkMkvextract` (linia 543), `subtitles:listEmbedded` (linia 633), `getMkvExtractPath` (linia 521)

`execSync` blokuje główny wątek Node.js (a tym samym okno Electrona) na czas wykonania komendy. Dla szybkich komend (ffmpeg --version) to ~100ms, ale dla `mkvextract` może być >1s.

**Fix:** Użyj `execAsync` (już zaimportowanego jako `promisify(execCb)`) zamiast `execSync` we wszystkich handlerach:

```typescript
// handlers.ts — dep:checkFfmpeg
ipcMain.handle('dep:checkFfmpeg', async () => {
  try {
    const { stdout } = await execAsync('ffmpeg -version', {
      encoding: 'utf-8', timeout: 10000, windowsHide: true
    });
    const match = stdout.match(/ffmpeg version (\S+)/);
    return { installed: true, version: match ? match[1] : 'unknown' };
  } catch {
    return { installed: false, version: null };
  }
});
```

### P2.4 — Brak wirtualizacji dla długich list (LibraryView)

**Plik:** `src/renderer/src/views/LibraryView.vue`

Biblioteka może zawierać tysiące utworów. Obecnie wszystkie są renderowane — brak wirtualizacji. `@tanstack/vue-virtual` jest już w zależnościach.

**Fix:** Użyj `vue-virtual` w komponencie listy:

```vue
<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual';

const parentRef = ref<HTMLDivElement>();
const virtualizer = useVirtualizer({
  count: tracks.length,
  getScrollElement: () => parentRef.value,
  estimateSize: () => 48,
});
</script>

<template>
  <div ref="parentRef" class="overflow-auto h-full">
    <div :style="{ height: `${virtualizer.getTotalSize()}px` }">
      <div v-for="vrow in virtualizer.getVirtualItems()" :key="vrow.key"
           :style="{ transform: `translateY(${vrow.start}px)`, height: `${vrow.size}px` }">
        <TrackRow :track="tracks[vrow.index]" />
      </div>
    </div>
  </div>
</template>
```

### P2.5 — CoverCache jako reactive Map — problem z reaktywnością Pinia

**Plik:** `src/renderer/src/stores/player.ts:27-29`

```typescript
const coverCache = reactive(new Map<string, ...>());
```

Reaktywne Mapy w Vue 3 / Pinia mają **ograniczoną reaktywność** — Vue 3 Proxy nie przechwytuje `.get()`, `.set()`, `.delete()` na Map tak dobrze. W rezultacie widoki nie odświeżają się, gdy okładka zostanie załadowana.

**Fix:** Użyj zwykłego obiektu (`Record<string, ...>`) lub `ref<Map>` z jawnym triggerem:

```typescript
// Opcja A — obiekt
const coverCache = ref<Record<string, { type: ...; data: ... }>>({});
function setCover(path: string, cover: ...) {
  coverCache.value[path] = cover;
}

// Opcja B — ręczny trigger
const coverCache = ref(new Map<string, ...>());
function setCover(path: string, cover: ...) {
  coverCache.value.set(path, cover);
  triggerRef(coverCache);
}
```

### P2.6 — Budowa fontMap przy każdym załadowaniu napisów (brak cache)

**Plik:** `src/renderer/src/composables/useSubtitleRenderer.ts:93-128`

Funkcja `buildFontMap` parsuje ASS, wyszukuje rodziny czcionek, a następnie dla każdej brakującej wykonuje `queryRemoteFonts` (zapytanie sieciowe). To jest wykonywane **przy każdym** załadowaniu napisów, nawet dla tych samych plików.

**Fix:** Dodaj cache na podstawie hasha zawartości ASS:

```typescript
const fontMapCache = new Map<string, any>();

async function buildFontMap(assContent: string, attachmentNames: MkvFont[] = []) {
  const cacheKey = `${hashContent(assContent)}-${attachmentNames.map(f => f.name).join(',')}`;
  if (fontMapCache.has(cacheKey)) return fontMapCache.get(cacheKey);
  
  const fontMap = { ...availableFonts };
  // ... istniejąca logika ...
  
  fontMapCache.set(cacheKey, fontMap);
  return fontMap;
}

function hashContent(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}
```

### P2.7 — `urlToDataUrl` — nieefektywna konwersja WASM do data URL

**Plik:** `src/renderer/src/composables/useSubtitleRenderer.ts:254-263`

Funkcja konwertuje plik WASM na data URL przez ArrayBuffer → string → base64. To jest operacja na ~1-2MB danych, wykonywana przy każdym uruchomieniu JASSUB.

**Fix:** Użyj oryginalnego URL (Vite już obsługuje WASM jako asset):

```typescript
// Zamiast urlToDataUrl, przekaż oryginalne URL
// W konstruktorze JASSUB:
jassubInstance = new JASSUBCtor({
  video: videoEl,
  subContent: assContent,
  workerUrl,
  wasmUrl: wasmUrl, // oryginalny URL (Vite już go serwuje poprawnie)
  modernWasmUrl: modernWasmUrl,
  // ...
});
```

### P2.8 — Lazy loading tylko na poziomie routingu, nie w komponentach

**Plik:** `src/renderer/src/router/index.ts`

Trasy są ładowane lazy, ale wewnątrz widoków wszystkie komponenty są importowane statycznie. Np. `SettingsView.vue` importuje 15 komponentów Lucide, ale tylko ~2-3 są widoczne naraz.

**Fix:** Importuj Lucide komponenty lazy dla zakładek, które nie są domyślnie widoczne:

```vue
<script setup lang="ts">
import { shallowRef, defineAsyncComponent } from 'vue';

// Zamiast:
// import { Palette, Play, Download, Keyboard, ... } from '@lucide/vue';

// Użyj:
const tabIcons = {
  appearance: shallowRef(defineAsyncComponent(() => 
    import('@lucide/vue').then(m => m.Palette))),
  playback: shallowRef(defineAsyncComponent(() => 
    import('@lucide/vue').then(m => m.Play))),
  // ...
};
</script>
```

### P2.9 — Brak pomijania klatek animacji gdy zakładka nieaktywna

**Plik:** `src/renderer/src/modules/audioEngine.ts:152-159`

RAF loop (`requestAnimationFrame`) działa **non-stop** nawet gdy okno nie jest widoczne, co marnuje CPU.

**Fix:** Użyj `Page Visibility API`:

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRafLoop();
  } else if (audioEl && !audioEl.paused) {
    startRafLoop();
  }
});
```

### P2.10 — Generowanie audioSrc przez konkatenację stringów

**Plik:** `src/renderer/src/modules/audioEngine.ts:188,351`

```typescript
const src = `file:///${next.path.replace(/\\/g, '/')}`;
```

To może powodować problemy z specjalnymi znakami w ścieżkach (np. `#`, `?`, spacje).

**Fix:** Użyj `encodeURI()`:

```typescript
const src = `file:///${encodeURI(next.path.replace(/\\/g, '/'))}`;
```

### P2.11 — SettingsView — 772 linie w jednym pliku

**Plik:** `src/renderer/src/views/SettingsView.vue`

To obniża czytelność i utrudnia utrzymanie. Każda zakładka powinna być osobnym komponentem.

**Fix:** Podziel na komponenty per-zakładka:

| Komponent | Zakładka |
|-----------|----------|
| `SettingsAppearance.vue` | Wygląd |
| `SettingsPlayback.vue` | Odtwarzanie |
| `SettingsPiP.vue` | PiP |
| `SettingsDownload.vue` | Pobieranie |
| `SettingsShortcuts.vue` | Skróty |
| `SettingsNetwork.vue` | Sieć |
| `SettingsApiKeys.vue` | Klucze API |
| `SettingsUpdates.vue` | Aktualizacje |
| `SettingsDependencies.vue` | Zależności |

Każdy komponent importowany lazy:
```vue
<component :is="currentTabComponent" />
```

### P2.12 — `process.hidden` check w audioEngine RAF loop (marnowanie CPU)

Nie zaimplementowano. Patrz punkt P2.9.

---

## 3. Problemy stabilności

### P3.1 — Brak Error Boundaries

**Plik:** `src/renderer/src/App.vue` (cały plik)

Brak mechanizmu łapania błędów w komponentach. Jeśli którykolwiek komponent rzuci błędem (np. `playerStore.currentTrack?.type` gdy store niezaładowany), cała aplikacja padnie.

**Fix:** Dodaj globalny Error Handler w Vue i komponent nadrzędny:

```typescript
// main.ts
const app = createApp(App);
app.config.errorHandler = (err, instance, info) => {
  console.error('[Onda Error]', err, info);
  // Opcjonalnie: wyślij do UI.notify()
};
app.config.warnHandler = (msg, instance, trace) => {
  console.warn('[Onda Warn]', msg, trace);
};
```

Dodaj ErrorBoundary komponent:
```vue
<!-- ErrorBoundary.vue -->
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';
const error = ref<Error | null>(null);
onErrorCaptured((err) => { error.value = err; return false; });
</script>
<template>
  <div v-if="error" class="p-4 bg-red-500/10 text-red-400 rounded-xl">
    <h3>Wystąpił błąd</h3>
    <pre>{{ error.message }}</pre>
  </div>
  <slot v-else />
</template>
```

### P3.2 — `require('electron')` w runtime zamiast importu

**Plik:** `src/main/ipc/handlers.ts:340-346, 416-419, 426-428, 447, 507-508`

Wewnątrz funkcji handlerów użyto `require('electron')` zamiast zaimportować `app` na górze pliku. To działa, ale:
- Jest wolniejsze (runtime require zamiast static import)
- TypeScript nie typuje tego poprawnie
- Może crashować przy tree-shakingu

**Fix:** Zaimportuj `app` statycznie:

```typescript
// handlers.ts — linia 1
import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron';

// Następnie usuń wszystkie `require('electron')` i użyj `app` bezpośrednio
```

### P3.3 — `window.api` może być undefined podczas SSR/testów/startupu

**Plik:** Wiele plików — np. `src/renderer/src/stores/player.ts:54-55`

```typescript
if (window.api) {
  const data = await window.api.invoke('settings:get');
}
```

To dobre zabezpieczenie, ale nie jest używane konsekwentnie. `src/renderer/src/stores/player.ts:78` — `loadFavorites()` jest wywoływana natychmiast po zdefiniowaniu, a wewnątrz jest `window.api?.invoke('settings:get')`, ale nie ma sprawdzenia czy `window.api` istnieje.

**Fix:** Ujednolic wzorzec — używaj optional chaining `window.api?.invoke(...)` wszędzie LUB dodaj wrapper:

```typescript
// utils/ipc.ts
export function safeInvoke(channel: string, ...args: unknown[]) {
  if (!window.api) return Promise.resolve(null);
  return window.api.invoke(channel, ...args).catch(() => null);
}
```

Następnie zamień wszystkie `window.api.invoke` na `safeInvoke`.

### P3.4 — `audioEngine` — modułowe mutable state bez synchronizacji

**Plik:** `src/renderer/src/modules/audioEngine.ts`

Stan modułu (linie 5-21) to mutable zmienne modułowe. Funkcje callback (`_onTimeUpdate`, `_onDurationChange`) są przypisane przez settery. Jeśli `_onTimeUpdate` zostanie podmieniony w trakcie działania RAF loop, może dojść do wyścigu (race condition) — callback wywołany na starym handlerze.

**Fix:** Użyj Set zamiast pojedynczej referencji:

```typescript
const _onTimeUpdateCallbacks = new Set<(time: number) => void>();
// Zamiast:
// let _onTimeUpdate: ((time: number) => void) | null = null;

// W RAF tick:
_onTimeUpdateCallbacks.forEach(fn => fn(audioEl.currentTime));
```

### P3.5 — `usePiP()` — init() wywoływany w ciele composable (poza lifecycle)

**Plik:** `src/renderer/src/composables/usePiP.ts:78`

```typescript
init(); // wywołane w ciele funkcji, nie w onMounted
```

To rejestruje listenery IPC natychmiast, nawet jeśli komponent nie jest zmontowany. Może prowadzić do wycieków pamięci, jeśli `onUnmounted` nie zadziała (np. przy błędzie routingu).

**Fix:** Przenieś `init()` do `onMounted` lub udostępnij jako funkcję do jawnego wywołania:

```typescript
export function usePiP(callbacks?) {
  const isActive = ref(false);
  const currentTime = ref(0);
  const cleanups: (() => void)[] = [];

  onMounted(() => {
    cleanups.push(window.api.on('pip:closed', (time) => { /* ... */ }));
    cleanups.push(window.api.on('pip:ended', () => { /* ... */ }));
  });

  onUnmounted(() => {
    cleanups.forEach(fn => fn());
    cleanups.length = 0;
  });

  // ... reszta
}
```

### P3.6 — Brak AbortController dla IPC które mogą być anulowane

Podczas szybkiej nawigacji między widokami, IPC wywołania z poprzedniego widoku mogą kontynuować (np. `subtitles:listEmbedded`, `media:getDuration`). Gdy callback zostanie wykonany, może modyfikować store już dla innego utworu.

**Fix:** Dodaj AbortController pattern lub flagę `cancelled`:

```typescript
// useVideoPlayer
let currentLoadId = 0;

async function loadSubtitles(path: string) {
  const loadId = ++currentLoadId;
  const result = await window.api.listEmbeddedSubtitles(path);
  if (loadId !== currentLoadId) return; // anulowane przez nowe wywołanie
  player.subtitleTracks = result;
}
```

### P3.7 — `settings.load()` asynchroniczne — dostęp przed załadowaniem

**Plik:** `src/renderer/src/App.vue:65-69`

```typescript
onMounted(() => {
  settings.load().then(() => applyTheme());
  if (!moduleManager.getActive()) {
    moduleManager.switchTo('home');
  }
});
```

`applyTheme()` jest wywołane dopiero po załadowaniu, ale widok może próbować odczytać `settings.appearance.theme` wcześniej (np. komponent `Sidebar` czy `TitleBar`). W efekcie na ułamek sekundy pojawiają się domyślne style, a potem właściwe.

**Fix:** Wstrzymaj montowanie aplikacji do załadowania ustawień:

```typescript
// main.ts
async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  app.use(pinia);
  app.use(router);

  const settings = useSettingsStore();
  await settings.load();

  moduleManager.initAll().then(() => {
    app.mount('#app');
  });
}

bootstrap();
```

### P3.8 — `audioCtx.createMediaElementSource` może być wywołane tylko raz na element

**Plik:** `src/renderer/src/modules/audioEngine.ts:75-82`

`createMediaElementSource` rzuci błędem, jeśli zostanie wywołane drugi raz na tym samym `HTMLAudioElement`. Kod ma obsługę tego (try-catch w `connectAudio`), ale może to powodować wycieki źródła — stary `sourceNode` nie jest odłączany prawidłowo.

**Fix:** Sprawdzaj czy `sourceNode` już istnieje dla tego elementu zamiast łapać wyjątki:

```typescript
function connectAudio(el: HTMLAudioElement): void {
  ensureAudioContext();
  ensureEqChain();

  if (sourceNode) {
    try { sourceNode.disconnect(); } catch {}
    sourceNode = null;
  }
  
  // Sprawdź czy el nie ma już sourceNode
  if (sourceNode === null || (sourceNode as any)?.mediaElement !== el) {
    sourceNode = audioCtx!.createMediaElementSource(el);
  }
  
  sourceNode.connect(crossfadeGainA!);
}
```

### P3.9 — Brak sanity check dla `usePlayerStore` w `handleEnded`

**Plik:** `src/renderer/src/modules/audioEngine.ts:130-150`

`handleEnded` jest wywoływany z event listenera na `audioEl`. Jeśli store nie został zainicjalizowany (np. w PiP window), dostęp do `player.repeat` rzuci błędem.

**Fix:** Dodaj guard:

```typescript
function handleEnded(): void {
  let player;
  try { player = usePlayerStore(); } catch { return; }
  // ... reszta
}
```

### P3.10 — PiP manager nie sprawdza czy mainWindow istnieje

**Plik:** `src/main/pip-manager.ts` (przypuszczalnie)

W `src/main/index.ts:215` — `pipManager.setMainWindow(mainWindow)` — mainWindow może być null w momencie wywołania, chociaż w praktyce `createWindow()` zwraca obiekt synchronicznie. Jednak przy odtwarzaniu, jeśli okno główne zostanie zamknięte, PiP może crashować.

**Fix:** Dodaj guardy w pip-manager:

```typescript
function getParentWindow(): BrowserWindow | null {
  return mainWindow ?? BrowserWindow.getFocusedWindow() ?? null;
}
```

---

## 4. Problemy architektury i modułowości

### P4.1 — ModuleManager.switchTo nie jest awaitowany w router.afterEach

**Plik:** `src/renderer/src/router/index.ts:95`

```typescript
moduleManager.switchTo(moduleId);
```

`switchTo` jest `async` (zawiera `await active.deactivate()`), ale `afterEach` nie czeka na jego zakończenie. W rezultacie nowy widok może zostać zamontowany zanim stary moduł się deaktywuje, prowadząc do konfliktów (dwa moduły aktywne jednocześnie).

**Fix:** Router Vue nie wspiera `async` w `afterEach`. Użyj `beforeEach` z zwracaniem Promise lub ręcznego guarda:

```typescript
let _isSwitching = false;
let _pendingSwitch: string | null = null;

router.beforeEach(async (to) => {
  if (_isSwitching) {
    _pendingSwitch = to.name as string;
    return false;
  }
  
  const routeName = to.name as string;
  const moduleId = ROUTE_MODULE_MAP[routeName];
  if (!moduleId) return true;
  
  _isSwitching = true;
  try {
    await moduleManager.switchTo(moduleId);
  } finally {
    _isSwitching = false;
  }
  
  if (_pendingSwitch === routeName) {
    _pendingSwitch = null;
    // router.replace(routeName) — rekursja
  }
});
```

### P4.2 — Cyrkularne zależności (circular dependency risk)

**Plik:** `src/renderer/src/modules/audioEngine.ts:2-3`

`audioEngine.ts` importuje `usePlayerStore` i `useSettingsStore`. Z kolei `useAudioPlayer.ts` importuje `audioEngine`. Ponadto store'y mogą importować composables (choć obecnie tego nie robią). Gdyby w przyszłości store zaimportował `useAudioPlayer`, powstałaby cyrkularna zależność.

**Fix:** Wprowadź EventBus dla komunikacji audioEngine → store:

```typescript
// utils/audioEvents.ts
import mitt from 'mitt'; // lub użyj prostego EventTarget
type Events = {
  timeUpdate: number;
  durationChange: number;
  playStateChange: boolean;
  trackEnd: void;
};
export const audioEvents = mitt<Events>();

// audioEngine.ts — zamiast callbacków:
audioEvents.emit('timeUpdate', el.currentTime);

// useAudioPlayer.ts:
audioEvents.on('timeUpdate', (time) => { currentTime.value = time; });
```

### P4.3 — audioEngine jako singleton z mutable state — brak testowalności

**Plik:** `src/renderer/src/modules/audioEngine.ts`

Wszystkie zmienne (audioEl, audioCtx, sourceNode, itp.) są modułowe (poza funkcją). To uniemożliwia:
- Testowanie jednostkowe (nie można stworzyć drugiej instancji)
- Izolację między wieloma oknami (PiP vs main)
- Bezpieczne resetowanie stanu

**Fix:** Refaktor na klasę:

```typescript
export class AudioEngine {
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  // ... reszta stanu jako properties

  init(): void { /* ... */ }
  loadTrack(track: MediaFile): void { /* ... */ }
  // ...
}

// Singleton:
export const audioEngine = new AudioEngine();
```

To zachowuje obecne API, ale daje możliwość tworzenia instancji do testów.

### P4.4 — Overlap odpowiedzialności PlayerView / useVideoPlayer

**Plik:** `src/renderer/src/views/PlayerView.vue` (394 linie) + `src/renderer/src/composables/useVideoPlayer.ts` (335 linii)

Razem 729 linii na wideo player. Obie warstwy mają logikę: `PlayerView` zarządza UI, eventami klawiatury, OSD, fullscreen, myszą. `useVideoPlayer` zarządza video elementem, PiP, napisami, watchami. Granica jest nieostra.

**Fix:** Przenieś eventy klawiatury i OSD do osobnego composable:

```typescript
// composables/usePlayerKeyboard.ts
export function usePlayerKeyboard(player, vp, showOSD) {
  function onKeydown(e: KeyboardEvent) { /* ... */ }
  onMounted(() => document.addEventListener('keydown', onKeydown));
  onUnmounted(() => document.removeEventListener('keydown', onKeydown));
  return { onKeydown };
}
```

### P4.5 — Brak DI (dependency injection) — trudne mockowanie

Wszystkie moduły i composables importują zależności bezpośrednio. Nie można prosto podmienić `audioEngine` na mock w testach.

**Fix:** Użyj `provide/inject` lub opcjonalnych parametrów konstruktora:

```typescript
// useAudioPlayer.ts
export function useAudioPlayer(audioEngineInstance = audioEngine) {
  // używaj audioEngineInstance zamiast globalnego
}
```

### P4.6 — ModuleManager nie wspiera priorytetów ani zależności między modułami

**Plik:** `src/renderer/src/modules/ModuleManager.ts`

Moduły są inicjalizowane w kolejności rejestracji. Nie ma mechanizmu:
- "Poczekaj aż moduł X zainicjalizuje się przed modułem Y"
- "Jeśli moduł A jest aktywny, nie deaktywuj go"
- Współdzielenie kontekstu między modułami

**Fix:** Dodaj opcjonalne `dependencies` i `priority` do interfejsu:

```typescript
export interface AppModule {
  id: string;
  name: string;
  dependencies?: string[];
  priority?: number; // wyższy = uruchamiany pierwszy
  // ...
}
```

W `initAll()` posortuj według priorytetu i sprawdź zależności.

### P4.7 — Duplikacja stałych (VIDEO_EXTS, AUDIO_EXTS)

**Plik:** `src/main/ipc/handlers.ts:16-28` i `src/renderer/src/utils/constants.ts` i `src/renderer/src/composables/useOpenMedia.ts:5`

Te same listy rozszerzeń zdefiniowane w trzech miejscach. Ryzyko rozjazdu się.

**Fix:** Przenieś do współdzielonego pliku (preload lub dedykowany shared):

```typescript
// src/shared/constants.ts
export const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.ogv'];
export const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.wma', '.opus', '.aiff', '.alac'];
```

Uwaga: main proces nie może importować z renderer, więc potrzebny jest osobny plik w src/shared/.

### P4.8 — modules/ExplorerModule i LibraryModule mają puste `init()` — niskie wykorzystanie wzorca modułowego

Większość modułów ma puste `init()` i trywialne `activate()`/`deactivate()`. Tylko `PlayerModule` faktycznie zarządza lifecyclem. Pozostałe są boilerplate'em.

**Fix:** Rozważ uproszczenie — tylko `PlayerModule` i ew. `YouTubeModule` potrzebują pełnego lifecycle. Dla reszty wystarczy prostszy mechanizm.

---

## 5. Problemy jakości kodu

### P5.1 — Brak testów

Żadnych testów jednostkowych, integracyjnych ani E2E. `package.json` nie zawiera test runnera.

**Fix:** Dodaj Vitest:

```bash
npm i -D vitest @vue/test-utils jsdom
```

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Zacznij od testów jednostkowych dla:
- `utils/formatters.ts` (formatowanie czasu, rozmiaru)
- `utils/fileTypes.ts` (mapowanie rozszerzeń)
- `composables/useOpenMedia.ts` (logika bez IPC)
- `stores/player.ts` (logika kolejki, shuffle, repeat)

### P5.2 — Typ `any` używany w wielu miejscach

- `src/main/ipc/handlers.ts:115` — `let parsed: any[];`
- `src/main/ipc/handlers.ts:639` — `.map((s: Record<string, unknown>) => ...)`
- `src/renderer/src/modules/audioEngine.ts:268` — `(videoSourceNode as any).mediaElement`

**Fix:** Zdefiniuj interfejsy dla JSON outputów ffprobe:

```typescript
interface FfprobeFormatOutput { format: { duration: string }; }
interface FfprobeStreamOutput { streams: Array<{ index: number; codec_name?: string; codec_type?: string; tags?: { language?: string; title?: string; filename?: string } }>; }
```

### P5.3 — Mieszany język (Polski/Angielski) w kodzie

Komentarze i stringi UI po polsku (`// Odłącz wideo jeśli było aktywne`, `'Nieznany błąd'`), ale kod i nazwy zmiennych po angielsku. Zmienna `_initialized` i komentarz `// not in local bin` obok siebie.

**Fix:** Ustal konwencję — angielski dla kodu i komentarzy, polski tylko dla stringów UI (i to przez i18n w przyszłości). Przetłumacz istniejące polskie komentarze na angielski.

### P5.4 — Non-null assertion operator `!` nadużywany

- `src/main/ipc/handlers.ts:224` — `win!`
- `src/main/ipc/handlers.ts:251` — `win!`
- `src/main/ipc/handlers.ts:299` — `win!`
- `src/renderer/src/modules/audioEngine.ts:352` — `audioEl!`

**Fix:** Użyj optional chaining i guardów zamiast `!`:

```typescript
// Zamiast:
const win = BrowserWindow.getFocusedWindow();
const result = await dialog.showOpenDialog(win!, { ... });

// Użyj:
const win = BrowserWindow.getFocusedWindow();
if (!win) return { canceled: true, filePaths: [] };
const result = await dialog.showOpenDialog(win, { ... });
```

### P5.5 — TypeScript strict mode wyłączony

**Plik:** `tsconfig.node.json` i `tsconfig.web.json`

Oba rozszerzają `@electron-toolkit/tsconfig`, które nie ma `strict: true`.

**Fix:** Dodaj strict do tsconfig:

```json
// tsconfig.node.json, tsconfig.web.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true
  }
}
```

Następnie napraw powstałe błędy typów (będzie ich sporo, ale podniosą jakość).

### P5.6 — `console.error` zamiast proper logging

Wiele miejsc używa `console.error` bez struktury:

```typescript
console.error('[Onda/attachments] mkvextract failed:', e.message?.split('\n')[0] || e);
console.error('[Onda/subtitles] extractEmbedded failed:', err);
```

**Fix:** Stwórz prosty logger:

```typescript
// utils/logger.ts
export const logger = {
  info: (tag: string, msg: string, ...args: unknown[]) => 
    console.log(`[Onda/${tag}]`, msg, ...args),
  error: (tag: string, msg: string, ...args: unknown[]) => 
    console.error(`[Onda/${tag}]`, msg, ...args),
  warn: (tag: string, msg: string, ...args: unknown[]) => 
    console.warn(`[Onda/${tag}]`, msg, ...args),
};
```

### P5.7 — Brak ESLint rule dla `@typescript-eslint/no-explicit-any`

`eslint.config.mjs` nie ma reguły zakazującej `any`. Raport mówi o wymaganiu tego.

### P5.8 — `await` wewnątrz pętli (choco install bez --no-progress)

**Plik:** `src/main/ipc/handlers.ts:487`

```typescript
const { stdout, stderr } = await execAsync('choco install ffmpeg -y --no-progress', ...);
```

`execAsync` czeka aż proces się zakończy. To jest OK dla wolnych operacji, ale blokuje IPC handler na długi czas. IPC handler powinien zwrócić `Promise` natychmiast i raportować progress przez `send`.

### P5.9 — Przechowywanie ulubionych w Set — nie jest serializowalny

**Plik:** `src/renderer/src/stores/player.ts:31`

```typescript
const favorites = ref<Set<string>>(new Set());
```

Pinia nie serializuje `Set` poprawnie — przy zapisie do electron-store, `Set` zostanie zapisany jako `{}` (pusty obiekt), a nie tablica. Obecnie kod konwertuje na tablicę ręcznie w `saveFavorites()`, ale `loadFavorites()` tworzy `Set` z tablicy. To działa, ale jest kruche.

**Fix:** Użyj `string[]` i wrappera:

```typescript
const favorites = ref<string[]>([]);

function isFavorite(path: string): boolean {
  return favorites.value.includes(path);
}

function toggleFavorite(path: string) {
  const idx = favorites.value.indexOf(path);
  if (idx >= 0) favorites.value.splice(idx, 1);
  else favorites.value.push(path);
  saveFavorites();
}
```

---

## 6. Martwy kod i placeholder

### P6.1 — `media:getThumbnail` — zawsze zwraca null

**Plik:** `src/main/ipc/handlers.ts:396-398`

```typescript
ipcMain.handle('media:getThumbnail', async (_event, _filePath: string) => {
  return null;
});
```

Nieużywane.

### P6.2 — `yt:*` — wszystkie placeholdery

**Plik:** `src/main/ipc/handlers.ts:400-415`

```typescript
yt:search → { items: [], nextPageToken: null }
yt:getInfo → null
yt:download → { success: false, error: 'yt-dlp not installed' }
yt:getChannel → null
```

YouTube URL widoku istnieje, ale żadne wywołanie nie jest obsłużone.

### P6.3 — `update:*` — placeholdery

**Plik:** `src/main/ipc/handlers.ts:416-429`

```typescript
update:check → { available: false, version: app.getVersion(), notes: '' }
update:download → { success: false }
update:install → app.relaunch() + app.exit(0)
```

UI SettingsView ma zakładkę "Aktualizacje", ale backend nie działa.

### P6.4 — SettingsView — zakładki Network i API Keys bez backendu

UI renderuje inputy, ale nie ma IPC handlerów do zapisu tych wartości. Zakładka "Sieć" i "Klucze API" są całkowicie nieaktywne — przycisk "Zapisz klucz API" nie robi nic.

### P6.5 — SettingsView — shortcut keys są tylko wyświetlane, nie można ich zmienić

UI wyświetla skróty, ale nie ma interaktywnego bindingu — użytkownik nie może zmienić skrótu.

### P6.6 — `pip.html` i `pip.ts` — osobnym bundle, ale...?

**Plik:** `src/renderer/pip.html`, `src/renderer/src/pip.ts`, `D:\Onda\src\renderer\src\pip.ts`

Są to osobne entry pointy dla PiP okna. W praktyce PiP jest zarządzany przez `pip-manager.ts` w main process, który tworzy osobne `BrowserWindow` z preload. Potrzebny jest osobny bundle TYLKO jeśli PiP ma własną logikę Vue — obecnie wygląda na to, że nie jest używany.

---

## 7. Plan naprawczy — krok po kroku

### Faza 1: Stabilność (Priority: CRITICAL) — Szacowany czas: 2-3 dni

| Krok | Co zrobić | Pliki | Ryzyko |
|------|-----------|-------|--------|
| **1.1** | Zastąp `require('electron')` static importem `app` | `src/main/ipc/handlers.ts` | Niskie — czysta refaktoryzacja |
| **1.2** | Dodaj ErrorHandler w Vue | `src/main.ts`, nowy `ErrorBoundary.vue` | Niskie — nie wpływa na logikę |
| **1.3** | Usuń `!` non-null assertions w main process | `src/main/ipc/handlers.ts` (win!, itp.) | Niskie — dodaje guardy |
| **1.4** | Ujednolic `window.api?.` — optional chaining wszędzie | Wszystkie store'y i composables | Niskie — dodaje bezpieczeństwo |
| **1.5** | Przenieś `init()` w `usePiP` do `onMounted` | `src/renderer/src/composables/usePiP.ts` | Średnie — zmiana lifecycle listenerów |
| **1.6** | Dodaj flagę `currentLoadId` w `useVideoPlayer` | `src/renderer/src/composables/useVideoPlayer.ts` | Średnie — zapobiega race condition |
| **1.7** | Dodaj guardy w `audioEngine.handleEnded` dla store dostępów | `src/renderer/src/modules/audioEngine.ts` | Niskie |
| **1.8** | Napraw serializację `Set` → `string[]` dla `favorites` | `src/renderer/src/stores/player.ts` | Niskie |

### Faza 2: Wydajność (Priority: HIGH) — Szacowany czas: 4-5 dni

| Krok | Co zrobić | Pliki | Ryzyko |
|------|-----------|-------|--------|
| **2.1** | Static import `electron-store` | `src/main/ipc/handlers.ts` | Niskie |
| **2.2** | Dodaj debounce do `save()` w settings store | `src/renderer/src/stores/settings.ts` | Niskie — opóźnienie zapisu o 300ms |
| **2.3** | Zamień `execSync` na `execAsync` we wszystkich handlerach | `src/main/ipc/handlers.ts` | Średnie — zmiana na async, ale API tego samego |
| **2.4** | Dodaj wirtualizację w LibraryView i innych listach | `src/renderer/src/views/LibraryView.vue`, `src/renderer/src/views/ExplorerView.vue` | Średnie — wymaga refaktora szablonu |
| **2.5** | Dodaj Page Visibility API do RAF loop w audioEngine | `src/renderer/src/modules/audioEngine.ts` | Niskie |
| **2.6** | Dodaj cache do `buildFontMap` w subtitleRenderer | `src/renderer/src/composables/useSubtitleRenderer.ts` | Niskie |
| **2.7** | Zoptymalizuj `urlToDataUrl` — używaj oryginalnych URL | `src/renderer/src/composables/useSubtitleRenderer.ts` | Niskie |
| **2.8** | Podziel `SettingsView.vue` na komponenty per-zakładka | `src/renderer/src/views/SettingsView.vue` + 9 nowych plików | Średnie — duża refaktoryzacja |

### Faza 3: Architektura (Priority: MEDIUM) — Szacowany czas: 5-7 dni

| Krok | Co zrobić | Pliki | Ryzyko |
|------|-----------|-------|--------|
| **3.1** | Dodaj await do `moduleManager.switchTo` przez `beforeEach` | `src/renderer/src/router/index.ts` | Wysokie — zmiana logiki routingu, testować dokładnie |
| **3.2** | Wprowadź EventBus dla komunikacji audioEngine → store | `src/renderer/src/modules/audioEngine.ts`, `src/renderer/src/composables/useAudioPlayer.ts` | Wysokie — zmiana architektury komunikacji |
| **3.3** | Refaktor audioEngine na klasę (zachowaj singleton API) | `src/renderer/src/modules/audioEngine.ts` | Średnie |
| **3.4** | Przenieś eventy klawiatury do osobnego composable | `src/renderer/src/views/PlayerView.vue`, nowy composable | Niskie |
| **3.5** | Stwórz `src/shared/constants.ts` i usuń duplikacje | `src/main/ipc/handlers.ts`, `src/renderer/src/composables/useOpenMedia.ts`, `src/renderer/src/utils/constants.ts` | Niskie |
| **3.6** | Dodaj strict mode w TypeScript i napraw błędy | `tsconfig.node.json`, `tsconfig.web.json` | Wysokie — dużo błędów do naprawy |
| **3.7** | Dodaj `dependency` i `priority` do `AppModule` | `src/renderer/src/modules/ModuleManager.ts` | Niskie — rozszerzenie API |

### Faza 4: Jakość kodu (Priority: MEDIUM) — Szacowany czas: 3-4 dni

| Krok | Co zrobić | Pliki | Ryzyko |
|------|-----------|-------|--------|
| **4.1** | Dodaj Vitest i podstawowe testy | Nowe pliki `*.test.ts` | Niskie |
| **4.2** | Dodaj `@typescript-eslint/no-explicit-any` rule | `eslint.config.mjs` | Niskie |
| **4.3** | Stwórz logger i zastąp `console.error` | `src/renderer/src/utils/logger.ts` + edycje | Niskie |
| **4.4** | Przetłumacz polskie komentarze na angielski | Wszystkie pliki `.ts`, `.vue` | Niskie |
| **4.5** | Usuń lub zaimplementuj placeholdery (yt:*, update:*, network) | `src/main/ipc/handlers.ts` | Średnie |

### Faza 5: Nowe funkcjonalności (Priority: LOW) — Szacowany czas: 5-7 dni

| Krok | Co zrobić | Pliki | Ryzyko |
|------|-----------|-------|--------|
| **5.1** | Zaimplementuj YouTube API (search, getInfo) | `src/main/ipc/handlers.ts`, `YouTubeView.vue`, `youtube.store.ts` | Wysokie — wymaga klucza API |
| **5.2** | Zaimplementuj auto-updates z electron-updater | `src/main/ipc/handlers.ts` | Wysokie |
| **5.3** | Dodaj interaktywne edytowanie skrótów klawiszowych | `SettingsView.vue` | Średnie |

---

## 8. Szacowany wpływ

| Faza | Czas | Wpływ na wydajność | Wpływ na stabilność | Ryzyko regresji |
|------|------|-------------------|-------------------|-----------------|
| Faza 1 | 2-3 dni | 0% | **+60%** | Niskie |
| Faza 2 | 4-5 dni | **+50%** | 0% | Średnie |
| Faza 3 | 5-7 dni | +10% | +20% | Wysokie |
| Faza 4 | 3-4 dni | 0% | +10% | Niskie |
| Faza 5 | 5-7 dni | -5% (nowe feat.) | -5% | Wysokie |

**Zalecenie:** Zacznij od Fazy 1 (stabilność) i Fazy 2 (wydajność) jako sprint 1. Faza 3 jako sprint 2. Faza 4 i 5 ciągle w tle.

---

*Raport wygenerowany na podstawie analizy kodu źródłowego projektu Onda.*
*Data: 2026-07-20*
