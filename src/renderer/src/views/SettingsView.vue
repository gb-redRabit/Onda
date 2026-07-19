<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import {
  Palette,
  Play,
  Download,
  Keyboard,
  Globe,
  Key,
  RefreshCw,
  RotateCcw,
  Box,
  PictureInPicture
} from '@lucide/vue';

const settings = useSettingsStore();

const DEP_LIST = [
  { name: 'FFmpeg', description: 'Transkodowanie i przetwarzanie audio/wideo' },
  { name: 'FFprobe', description: 'Analiza metadanych mediów (formaty, bitrate, duration)' },
  { name: 'yt-dlp', description: 'Pobieranie wideo z YouTube i innych serwisów' },
  { name: 'MKVToolbox', description: 'Wyciąganie czcionek z plików MKV (mkvextract)' }
];

const deps = ref(
  DEP_LIST.map((d) => ({
    ...d,
    installed: settings.getDependency(d.name)?.installed ?? false,
    version: settings.getDependency(d.name)?.version ?? null,
    installing: false,
    error: null as string | null
  }))
);

onMounted(() => {
  if (!hasCachedDeps()) {
    checkDependencies();
  }
});

function hasCachedDeps(): boolean {
  return DEP_LIST.every((d) => settings.getDependency(d.name)?.checkedAt);
}

const tab = ref('appearance');

const tabs = [
  { id: 'appearance', label: 'Wygląd', icon: Palette },
  { id: 'playback', label: 'Odtwarzanie', icon: Play },
  { id: 'pip', label: 'PiP', icon: PictureInPicture },
  { id: 'download', label: 'Pobieranie', icon: Download },
  { id: 'shortcuts', label: 'Skróty', icon: Keyboard },
  { id: 'network', label: 'Sieć', icon: Globe },
  { id: 'api-keys', label: 'Klucze API', icon: Key },
  { id: 'updates', label: 'Aktualizacje', icon: RefreshCw },
  { id: 'dependencies', label: 'Zależności', icon: Box }
];

const themes = [
  { id: 'dark', label: 'Ciemny', bg: '#0f0f17', fg: '#e8e8f0' },
  { id: 'light', label: 'Jasny', bg: '#f8f8fa', fg: '#1a1a2e' },
  { id: 'midnight', label: 'Midnight', bg: '#0d1117', fg: '#c9d1d9' },
  { id: 'spotify', label: 'Spotify', bg: '#121212', fg: '#b3b3b3' }
] as const;

const audioFormats = ['mp3', 'flac', 'ogg', 'aac'] as const;
const videoQualities = ['best', '1080p', '720p', '480p'] as const;

const toggles = [
  { key: 'gaplessPlayback' as const, label: 'Odtwarzanie bez przerw' },
  { key: 'normalization' as const, label: 'Normalizacja głośności' },
  { key: 'replayGain' as const, label: 'Replay Gain' },
  { key: 'autoPauseOnFocusLoss' as const, label: 'Auto-pauza przy utracie fokusa' },
  { key: 'rememberPosition' as const, label: 'Zapamiętuj pozycję odtwarzania' },
  { key: 'cursorHide' as const, label: 'Ukrywanie kursora' }
];

const pipPositions = [
  { value: 'bottom-right' as const, label: 'Prawy dolny' },
  { value: 'bottom-left' as const, label: 'Lewy dolny' },
  { value: 'top-right' as const, label: 'Prawy górny' },
  { value: 'top-left' as const, label: 'Lewy górny' }
] as const;

const pipPreviewOpen = ref(false);

async function toggleSettingsPiP() {
  if (pipPreviewOpen.value) {
    await window.api.pipPreviewStop();
    pipPreviewOpen.value = false;
    return;
  }

  const started = await window.api.pipPreviewStart({
    position: settings.playback.pipPosition,
    width: settings.playback.pipWidth,
    height: settings.playback.pipHeight
  });
  if (started) {
    pipPreviewOpen.value = true;
  }
}

watch(tab, (_newTab, oldTab) => {
  if (oldTab === 'pip' && pipPreviewOpen.value) {
    window.api.pipPreviewStop().then(() => {
      pipPreviewOpen.value = false;
    });
  }
});

watch(
  () => [settings.playback.pipPosition, settings.playback.pipWidth, settings.playback.pipHeight],
  () => {
    if (pipPreviewOpen.value) {
      window.api.pipPreviewUpdate({
        position: settings.playback.pipPosition,
        width: settings.playback.pipWidth,
        height: settings.playback.pipHeight
      });
    }
  }
);

async function checkDependencies(): Promise<void> {
  for (const dep of deps.value) {
    dep.installing = true;
    dep.error = null;
  }
  const [ffmpeg, ffprobe, ytdlp, mkv] = await Promise.all([
    window.api.checkFfmpeg(),
    window.api.checkFfprobe(),
    window.api.checkYtdlp(),
    window.api.checkMkvextract()
  ]);
  const results = [ffmpeg, ffprobe, ytdlp, mkv];
  const now = Date.now();
  deps.value.forEach((dep, i) => {
    dep.installed = results[i].installed;
    dep.version = results[i].version;
    dep.installing = false;
    settings.updateDependency(dep.name, {
      installed: results[i].installed,
      version: results[i].version,
      checkedAt: now
    });
  });
}

async function installDependency(dep: (typeof deps.value)[0]): Promise<void> {
  dep.installing = true;
  dep.error = null;

  let installFn, checkFn;
  if (dep.name === 'FFmpeg' || dep.name === 'FFprobe') {
    installFn = window.api.installFfmpeg;
    checkFn = dep.name === 'FFmpeg' ? window.api.checkFfmpeg : window.api.checkFfprobe;
  } else if (dep.name === 'MKVToolbox') {
    installFn = window.api.installMkvextract;
    checkFn = window.api.checkMkvextract;
  } else {
    installFn = window.api.installYtdlp;
    checkFn = window.api.checkYtdlp;
  }

  const result = await installFn();
  const now = Date.now();
  if (result.success) {
    const status = await checkFn();
    dep.installed = status.installed;
    dep.version = status.version;
    settings.updateDependency(dep.name, {
      installed: status.installed,
      version: status.version,
      checkedAt: now
    });

    if (dep.name === 'FFmpeg') {
      const probeStatus = await window.api.checkFfprobe();
      deps.value[1].installed = probeStatus.installed;
      deps.value[1].version = probeStatus.version;
      settings.updateDependency('FFprobe', {
        installed: probeStatus.installed,
        version: probeStatus.version,
        checkedAt: now
      });
    }
  } else {
    dep.error = result.error || 'Instalacja nie powiodła się';
  }
  dep.installing = false;
}
</script>

<template>
  <div class="flex h-full">
    <div class="w-56 border-r border-border-default p-3 shrink-0">
      <div class="flex items-center justify-between mb-3 px-2">
        <h1 class="text-lg font-bold">Ustawienia</h1>
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover transition-colors"
          @click="settings.resetToDefaults"
        >
          <RotateCcw :size="14" />
        </button>
      </div>
      <div class="space-y-0.5">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
          :class="
            tab === t.id
              ? 'bg-accent-ghost text-accent-base'
              : 'text-fg-muted hover:bg-bg-hover hover:text-fg-base'
          "
          @click="tab = t.id"
        >
          <component :is="t.icon" :size="16" />{{ t.label }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-6">
      <!-- Appearance -->
      <div v-if="tab === 'appearance'" class="space-y-8 max-w-2xl">
        <div>
          <h2 class="text-sm font-semibold mb-3">Motyw</h2>
          <div class="grid grid-cols-4 gap-3">
            <button
              v-for="th in themes"
              :key="th.id"
              class="p-3 rounded-xl border-2 transition-all text-center"
              :class="
                settings.appearance.theme === th.id
                  ? 'border-accent-base shadow-lg shadow-accent-base/20'
                  : 'border-border-default hover:border-border-subtle'
              "
              @click="settings.updateAppearance({ theme: th.id })"
            >
              <div
                class="w-full h-8 rounded-lg mb-2 flex items-center justify-center"
                :style="{ backgroundColor: th.bg }"
              >
                <div class="w-6 h-1 rounded-full" style="background: #7c6aef" />
              </div>
              <span class="text-xs text-fg-muted">{{ th.label }}</span>
            </button>
          </div>
        </div>

        <div>
          <h2 class="text-sm font-semibold mb-3">Kolor akcentu</h2>
          <div class="flex gap-2">
            <button
              v-for="c in [
                '#7c6aef',
                '#3b82f6',
                '#34d399',
                '#fbbf24',
                '#f87171',
                '#ec4899',
                '#8b5cf6',
                '#06b6d4'
              ]"
              :key="c"
              class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
              :class="
                settings.appearance.accentColor === c
                  ? 'border-white scale-110'
                  : 'border-transparent'
              "
              :style="{ backgroundColor: c }"
              @click="settings.updateAppearance({ accentColor: c })"
            />
          </div>
        </div>

        <div>
          <h2 class="text-sm font-semibold mb-3">
            Rozmiar czcionki: {{ settings.appearance.fontSize }}px
          </h2>
          <input
            type="range"
            min="12"
            max="18"
            :value="settings.appearance.fontSize"
            class="w-full"
            @input="
              settings.updateAppearance({
                fontSize: parseInt(($event.target as HTMLInputElement).value)
              })
            "
          />
        </div>

        <div>
          <h2 class="text-sm font-semibold mb-3">Gęstość</h2>
          <div class="flex gap-2">
            <button
              v-for="d in ['compact', 'comfortable', 'spacious'] as const"
              :key="d"
              class="px-4 py-2 rounded-xl text-sm capitalize border transition-colors"
              :class="
                settings.appearance.density === d
                  ? 'border-accent-base bg-accent-ghost text-accent-base font-medium'
                  : 'border-border-default text-fg-muted hover:bg-bg-hover'
              "
              @click="settings.updateAppearance({ density: d })"
            >
              {{ d }}
            </button>
          </div>
        </div>

        <div>
          <h2 class="text-sm font-semibold mb-3">Pozycja panelu bocznego</h2>
          <div class="flex gap-2">
            <button
              v-for="pos in ['left', 'right'] as const"
              :key="pos"
              class="px-4 py-2 rounded-xl text-sm border transition-colors"
              :class="
                settings.appearance.sidebarPosition === pos
                  ? 'border-accent-base bg-accent-ghost text-accent-base font-medium'
                  : 'border-border-default text-fg-muted hover:bg-bg-hover'
              "
              @click="settings.updateAppearance({ sidebarPosition: pos })"
            >
              {{ pos === 'left' ? 'Lewa' : 'Prawa' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Playback -->
      <div v-if="tab === 'playback'" class="space-y-6 max-w-2xl">
        <div>
          <h2 class="text-sm font-semibold mb-3">
            Przejście: {{ settings.playback.crossfadeDuration }}s
          </h2>
          <input
            type="range"
            min="0"
            max="12"
            :value="settings.playback.crossfadeDuration"
            class="w-full"
            @input="
              settings.updatePlayback({
                crossfadeDuration: parseInt(($event.target as HTMLInputElement).value)
              })
            "
          />
        </div>
        <div>
          <h2 class="text-sm font-semibold mb-3">
            Domyślna głośność: {{ Math.round(settings.playback.defaultVolume * 100) }}%
          </h2>
          <input
            type="range"
            min="0"
            max="100"
            :value="Math.round(settings.playback.defaultVolume * 100)"
            class="w-full"
            @input="
              settings.updatePlayback({
                defaultVolume: parseInt(($event.target as HTMLInputElement).value) / 100
              })
            "
          />
        </div>
        <div class="space-y-1">
          <div
            v-for="opt in toggles"
            :key="opt.key"
            class="flex items-center justify-between py-2.5 border-b border-border-default"
          >
            <span class="text-sm">{{ opt.label }}</span>
            <button
              class="relative w-10 h-5.5 rounded-full transition-colors"
              :class="settings.playback[opt.key] ? 'bg-accent-base' : 'bg-border-subtle'"
              @click="settings.updatePlayback({ [opt.key]: !settings.playback[opt.key] })"
            >
              <div
                class="absolute top-0.75 w-4 h-4 rounded-full bg-white shadow transition-all"
                :class="settings.playback[opt.key] ? 'left-5.5' : 'left-0.75'"
              />
            </button>
          </div>
        </div>

        <!-- cursor timeout -->
        <div v-if="settings.playback.cursorHide">
          <h2 class="text-sm font-semibold mb-3">
            Czas ukrycia kursora: {{ settings.playback.cursorTimeout }}s
          </h2>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            :value="settings.playback.cursorTimeout"
            class="w-full"
            @input="
              settings.updatePlayback({
                cursorTimeout: parseInt(($event.target as HTMLInputElement).value)
              })
            "
          />
        </div>

        <!-- playback speed -->
        <div>
          <h2 class="text-sm font-semibold mb-3">
            Domyślna prędkość: {{ settings.playback.playbackSpeed }}x
          </h2>
          <input
            type="range"
            min="0.2"
            max="3"
            step="0.25"
            :value="settings.playback.playbackSpeed"
            class="w-full"
            @input="
              settings.updatePlayback({
                playbackSpeed: parseFloat(($event.target as HTMLInputElement).value)
              })
            "
          />
        </div>
      </div>

      <!-- PiP -->
      <div v-if="tab === 'pip'" class="space-y-6 max-w-2xl">
        <div>
          <h2 class="text-sm font-semibold mb-3">Obraz w obrazie (PiP)</h2>
          <p class="text-xs text-fg-faint mb-4">
            Dostosuj ustawienia PiP. Zmiany są widoczne natychmiast jeśli PiP jest otwarte.
          </p>

          <div class="p-4 rounded-xl bg-bg-elevated border border-border-default space-y-4">
            <!-- preview button -->
            <div class="flex items-center justify-between pb-3 border-b border-border-default">
              <span class="text-sm">Podgląd PiP</span>
              <button
                class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                :class="
                  pipPreviewOpen
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-accent-base text-white hover:bg-accent-hover'
                "
                @click="toggleSettingsPiP"
              >
                {{ pipPreviewOpen ? 'Zamknij podgląd' : 'Pokaż podgląd' }}
              </button>
            </div>

            <!-- position -->
            <div>
              <h3 class="text-sm font-semibold mb-3">Pozycja okna</h3>
              <div class="flex gap-2">
                <button
                  v-for="p in pipPositions"
                  :key="p.value"
                  class="px-4 py-2 rounded-xl text-sm border transition-colors"
                  :class="
                    settings.playback.pipPosition === p.value
                      ? 'border-accent-base bg-accent-ghost text-accent-base font-medium'
                      : 'border-border-default text-fg-muted hover:bg-bg-hover'
                  "
                  @click="settings.updatePlayback({ pipPosition: p.value })"
                >
                  {{ p.label }}
                </button>
              </div>
            </div>

            <!-- width -->
            <div>
              <h3 class="text-sm font-semibold mb-3">
                Szerokość: {{ settings.playback.pipWidth }}px
              </h3>
              <input
                type="range"
                min="240"
                max="1200"
                step="10"
                :value="settings.playback.pipWidth"
                class="w-full"
                @input="
                  settings.updatePlayback({
                    pipWidth: parseInt(($event.target as HTMLInputElement).value)
                  })
                "
              />
            </div>

            <!-- height -->
            <div>
              <h3 class="text-sm font-semibold mb-3">
                Wysokość: {{ settings.playback.pipHeight }}px
              </h3>
              <input
                type="range"
                min="140"
                max="800"
                step="10"
                :value="settings.playback.pipHeight"
                class="w-full"
                @input="
                  settings.updatePlayback({
                    pipHeight: parseInt(($event.target as HTMLInputElement).value)
                  })
                "
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Download -->
      <div v-if="tab === 'download'" class="space-y-6 max-w-2xl">
        <div>
          <h2 class="text-sm font-semibold mb-3">Domyślny format audio</h2>
          <div class="flex gap-2">
            <button
              v-for="f in audioFormats"
              :key="f"
              class="px-4 py-2 rounded-xl text-sm uppercase border transition-colors font-medium"
              :class="
                settings.download.defaultAudioFormat === f
                  ? 'border-accent-base bg-accent-ghost text-accent-base'
                  : 'border-border-default text-fg-muted hover:bg-bg-hover'
              "
              @click="settings.updateDownload({ defaultAudioFormat: f })"
            >
              {{ f }}
            </button>
          </div>
        </div>
        <div>
          <h2 class="text-sm font-semibold mb-3">Domyślna jakość wideo</h2>
          <div class="flex gap-2">
            <button
              v-for="q in videoQualities"
              :key="q"
              class="px-4 py-2 rounded-xl text-sm border transition-colors"
              :class="
                settings.download.defaultVideoQuality === q
                  ? 'border-accent-base bg-accent-ghost text-accent-base font-medium'
                  : 'border-border-default text-fg-muted hover:bg-bg-hover'
              "
              @click="settings.updateDownload({ defaultVideoQuality: q })"
            >
              {{ q }}
            </button>
          </div>
        </div>
        <div>
          <h2 class="text-sm font-semibold mb-3">Szablon nazwy pliku</h2>
          <input
            :value="settings.download.filenameTemplate"
            class="w-full px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none"
            @change="
              settings.updateDownload({
                filenameTemplate: ($event.target as HTMLInputElement).value
              })
            "
          />
          <p class="text-xs text-fg-faint mt-1">
            Dostępne: {'{title}'}, {'{artist}'}, {'{album}'}, {'{year}'}
          </p>
        </div>
        <div>
          <h2 class="text-sm font-semibold mb-3">
            Maks. równoległych: {{ settings.download.maxConcurrent }}
          </h2>
          <input
            type="range"
            min="1"
            max="10"
            :value="settings.download.maxConcurrent"
            class="w-full"
            @input="
              settings.updateDownload({
                maxConcurrent: parseInt(($event.target as HTMLInputElement).value)
              })
            "
          />
        </div>
      </div>

      <!-- API Keys -->
      <div v-if="tab === 'api-keys'" class="space-y-6 max-w-2xl">
        <div>
          <h2 class="text-sm font-semibold mb-3">YouTube Data API v3</h2>
          <div class="p-4 rounded-xl bg-bg-elevated border border-border-default space-y-3">
            <div>
              <label class="text-xs text-fg-faint mb-1 block">Klucz API</label>
              <input
                type="password"
                placeholder="Wpisz klucz API YouTube..."
                class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-fg-faint mb-1 block">Maks. wyników (1-50)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value="25"
                  class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                />
              </div>
              <div>
                <label class="text-xs text-fg-faint mb-1 block">Kod regionu</label>
                <input
                  type="text"
                  value="US"
                  maxlength="2"
                  class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                />
              </div>
            </div>
            <button
              class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Zapisz klucz API
            </button>
          </div>
        </div>
      </div>

      <!-- Network -->
      <div v-if="tab === 'network'" class="space-y-6 max-w-2xl">
        <div>
          <h2 class="text-sm font-semibold mb-3">Proxy</h2>
          <div class="p-4 rounded-xl bg-bg-elevated border border-border-default space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm">Włącz proxy</span>
              <button class="relative w-10 h-5.5 rounded-full bg-border-subtle transition-colors">
                <div class="absolute top-0.75 left-0.75 w-4 h-4 rounded-full bg-white shadow" />
              </button>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <input
                placeholder="Host"
                class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
              />
              <input
                placeholder="Port"
                type="number"
                class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
              />
              <select
                class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
              >
                <option>HTTP</option>
                <option>HTTPS</option>
                <option>SOCKS5</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Shortcuts -->
      <div v-if="tab === 'shortcuts'" class="space-y-1 max-w-2xl">
        <div
          v-for="(key, action) in settings.shortcuts"
          :key="action"
          class="flex items-center justify-between py-2.5 border-b border-border-default"
        >
          <span class="text-sm capitalize">{{ String(action).replace(/-/g, ' ') }}</span>
          <kbd
            class="px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs text-fg-muted font-mono"
            >{{ key }}</kbd
          >
        </div>
      </div>

      <!-- Updates -->
      <div v-if="tab === 'updates'" class="space-y-6 max-w-2xl">
        <div class="p-4 rounded-xl bg-bg-elevated border border-border-default space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium">Auto-sprawdzaj aktualizacje</div>
              <div class="text-xs text-fg-faint">Automatycznie sprawdzaj nowe wersje</div>
            </div>
            <button class="relative w-10 h-5.5 rounded-full bg-accent-base transition-colors">
              <div class="absolute top-0.75 left-5.5 w-4 h-4 rounded-full bg-white shadow" />
            </button>
          </div>
          <div>
            <label class="text-xs text-fg-faint mb-1 block">Interwał sprawdzania</label>
            <select
              class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
            >
              <option value="startup">Przy starcie</option>
              <option value="hourly">Co godzinę</option>
              <option value="daily">Codziennie</option>
              <option value="weekly">Co tydzień</option>
            </select>
          </div>
          <button
            class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Sprawdź teraz
          </button>
        </div>
      </div>

      <!-- Dependencies -->
      <div v-if="tab === 'dependencies'" class="space-y-6 max-w-2xl">
        <div>
          <h2 class="text-sm font-semibold mb-3">Zależności systemowe</h2>
          <p class="text-xs text-fg-faint mb-4">
            Niektóre funkcje wymagają zewnętrznych narzędzi. Sprawdź ich status i zainstaluj
            brakujące.
          </p>
          <button
            class="px-4 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm font-medium hover:bg-bg-hover transition-colors mb-4"
            @click="checkDependencies"
          >
            Odśwież status
          </button>
          <div class="space-y-3">
            <div
              v-for="dep in deps"
              :key="dep.name"
              class="p-4 rounded-xl bg-bg-elevated border border-border-default"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div
                    class="w-2 h-2 rounded-full"
                    :class="dep.installed ? 'bg-green-500' : 'bg-red-500'"
                  />
                  <div>
                    <div class="text-sm font-medium">{{ dep.name }}</div>
                    <div class="text-xs text-fg-faint">{{ dep.description }}</div>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span v-if="dep.version" class="text-xs text-fg-faint font-mono"
                    >v{{ dep.version }}</span
                  >
                  <span v-else-if="dep.installed" class="text-xs text-green-500"
                    >Zainstalowano</span
                  >
                  <span v-else class="text-xs text-red-500">Brak</span>
                  <button
                    v-if="!dep.installed"
                    class="px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                    :disabled="dep.installing"
                    @click="installDependency(dep)"
                  >
                    {{ dep.installing ? 'Instalowanie...' : 'Instaluj' }}
                  </button>
                </div>
              </div>
              <div v-if="dep.error" class="mt-2 text-xs text-red-500">{{ dep.error }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
