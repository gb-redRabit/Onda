<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Shuffle, Repeat, Repeat2, SlidersHorizontal } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useLibraryStore } from '@renderer/stores/library';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useOnlineStore } from '@renderer/stores/online';
import { useSettingsStore } from '@renderer/stores/settings';
import { useYoutubeAuth } from '@renderer/composables/useYoutubeAuth';
import { getFileTypeInfo } from '@renderer/utils/fileTypes';
import { useContextMenu, type ContextMenuAction } from '@renderer/composables/useContextMenu';
import type { AppInfo } from '@shared/types/ipc';
import type { StatusBarSectionId } from '@renderer/types/settings';
import { logger } from '@shared/logger';
const { t, locale } = useI18n();

const ALL_SECTIONS: StatusBarSectionId[] = [
  'playing',
  'separator',
  'viewCounts',
  'downloads',
  'youtube',
  'dependencies',
  'version',
  'clock'
];

const info = ref<AppInfo | null>(null);

onMounted(async () => {
  clockTimer = window.setInterval(() => {
    now.value = new Date();
  }, 1000);
  try {
    const i = await window.api?.getAppInfo();
    if (i) info.value = i;
  } catch (e) {
    logger.warn('statusbar', 'load failed', e);
  }
});

onBeforeUnmount(() => {
  if (clockTimer !== null) clearInterval(clockTimer);
});

const now = ref(new Date());
let clockTimer: number | null = null;

const clockText = computed(() => {
  try {
    return now.value.toLocaleTimeString(locale.value === 'auto' ? undefined : locale.value, {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return now.value.toLocaleTimeString();
  }
});

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const audio = useAudioPlayer();
const library = useLibraryStore();
const explorer = useExplorerStore();
const youtube = useOnlineStore();
const settings = useSettingsStore();
const { status, ensureLoaded } = useYoutubeAuth();
ensureLoaded();

function hasSection(id: StatusBarSectionId): boolean {
  return settings.statusBar.sections.includes(id);
}

function goTo(path: string) {
  router.push(path);
}

// The status bar's "playing" section should open the AUDIO player for music
// and streams — only video goes to the video player (/player).
const playingTarget = computed(() => {
  const type = player.currentTrack?.type ?? player.streamPending?.type;
  return type === 'video' ? '/player' : '/audio';
});

const viewCounts = computed(() => {
  switch (route.name) {
    case 'audio':
      return [{ label: t('status.audioFiles'), count: library.audioCount }];
    case 'player':
      return [{ label: t('status.videoFiles'), count: library.videoCount }];
    case 'library':
      return [
        { label: t('status.audioFiles'), count: library.audioCount },
        { label: t('status.videoFiles'), count: library.videoCount },
        { label: t('status.images'), count: library.imageCount },
        { label: t('status.playlistsLabel'), count: library.playlists.length }
      ];
    case 'explorer': {
      const counts = { audio: 0, video: 0, image: 0, playlist: 0 };
      for (const f of explorer.files) {
        if (f.isDirectory || !f.extension) continue;
        const cat = getFileTypeInfo(f.extension).category;
        if (cat === 'audio' || cat === 'video' || cat === 'image' || cat === 'playlist') {
          counts[cat]++;
        }
      }
      return [
        { label: t('status.audioFiles'), count: counts.audio },
        { label: t('status.videoFiles'), count: counts.video },
        { label: t('status.images'), count: counts.image },
        { label: t('status.playlistsLabel'), count: counts.playlist }
      ].filter((s) => s.count > 0);
    }
    default:
      return [];
  }
});

const activeDownloads = computed(() =>
  youtube.downloads.filter((d) => d.status === 'downloading' || d.status === 'pending')
);
const activeDownload = computed(() => activeDownloads.value[0] || null);

const queuePosition = computed(() => {
  if (!player.currentTrack) return 0;
  const idx = player.displayQueue.findIndex((x) => x.path === player.currentTrack?.path);
  return idx >= 0 ? idx + 1 : 0;
});

const progressPct = computed(() => {
  if (!Number.isFinite(player.duration) || player.duration <= 0) return 0;
  return Math.min(100, Math.max(0, (player.currentTime / player.duration) * 100));
});

const showProgress = computed(() => !!player.currentTrack && player.duration > 60);

const viewContext = computed<string[]>(() => {
  switch (route.name) {
    case 'audio': {
      const layout = settings.appearance.audioLayout.preset ?? 'custom';
      const viz = settings.playback.visualization.mode;
      return [`${layout} · ${viz}`];
    }
    case 'player': {
      if (!player.currentTrack) return [];
      const meta = player.currentTrack.metadata;
      const parts: string[] = [];
      const fmt = meta?.format?.toUpperCase() || player.currentTrack.extension?.toUpperCase();
      if (fmt) parts.push(fmt);
      if (meta?.codec) parts.push(meta.codec);
      if (meta?.bitrate) parts.push(`${meta.bitrate}kbps`);
      if (player.subtitleTracks.length) parts.push(t('status.subs') + ': ' + (player.activeSubtitleId ? t('status.on') : t('status.off')));
      return [parts.join(' · ')];
    }
    case 'explorer': {
      const sel = explorer.selectedCount;
      return sel > 0 ? [`${sel} ${t('status.selected')}`] : [];
    }
    case 'online':
    case 'webcast': {
      const out = [`${youtube.subscriptions.length} ${t('status.subscriptions')}`];
      if (activeDownloads.value.length) {
        out.push(`${activeDownloads.value.length} ${t('status.activeDownloads')}`);
      }
      return out;
    }
    case 'downloads': {
      const act = activeDownloads.value;
      if (!act.length) return [];
      const speed = act[0].speed ? ' · ' + act[0].speed : '';
      return [`${act.length} ${t('status.activeDownloads')}${speed}`];
    }
    default:
      return [];
  }
});

const depsText = computed(() => {
  const installed = Object.values(settings.dependencies).filter((d) => d.installed && d.version);
  if (!installed.length) return '';
  return installed
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => `${d.name} ${d.version}`)
    .join(', ');
});

function toggleSection(id: StatusBarSectionId) {
  const current = settings.statusBar.sections;
  const next = current.includes(id)
    ? current.filter((s) => s !== id)
    : ALL_SECTIONS.filter((s) => current.includes(s) || s === id);
  settings.updateStatusBar({ sections: next });
}

const { open } = useContextMenu();

function openContextMenu(e: MouseEvent) {
  const defs: ContextMenuAction<null>[] = [
    ...ALL_SECTIONS.map((id): ContextMenuAction<null> => {
      const on = settings.statusBar.sections.includes(id);
      return {
        label: `${on ? '✓ ' : ''}${t(`status.sections.${id}`)}`,
        action: () => toggleSection(id)
      };
    }),
    { separator: true, label: '' },
    { label: t('status.hideStatusBar'), action: () => settings.updateStatusBar({ visible: false }) }
  ];
  open(e, defs, null);
}
</script>

<template>
  <div
    v-if="settings.statusBar.visible"
    data-app-statusbar
    class="h-6 bg-base-100/(--glass-alpha) border border-t border-base-300 flex items-center px-3 text-[11px] text-base-content/50 shrink-0 gap-4 select-none"
    @contextmenu="openContextMenu"
  >
    <template v-if="hasSection('playing')">
      <div
        class="flex items-center gap-1.5 cursor-pointer group rounded-sm px-0.5 -mx-0.5 hover:bg-base-content/5"
        :title="$t('status.playlistHint')"
        @click="goTo(playingTarget)"
      >
        <span v-if="player.streamPending" class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          {{ player.streamPending.name }} · {{ $t('status.connecting') }}
        </span>
        <template v-else-if="player.currentTrack">
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="player.isPlaying ? 'bg-success' : 'bg-base-300'"
          />
          <span
            v-if="player.currentTrack.type === 'stream' && audio.error.value === 'stream-failed'"
            class="text-error"
          >
            {{ $t('status.streamError') }}
          </span>
          <span
            v-else-if="player.currentTrack.type === 'audio' && audio.error.value === 'track-failed'"
            class="text-error"
          >
            {{ $t('status.trackError') }}
          </span>
          <span
            v-else-if="player.currentTrack.type === 'stream' && audio.isLoading.value"
            class="flex items-center gap-1.5"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {{ $t('status.buffering') }}
          </span>
          <span v-else>
            {{
              player.currentTrack.type === 'stream'
                ? $t('status.streamLabel')
                : player.currentTrack.extension?.toUpperCase()
            }}
            <template v-if="player.currentTrack.metadata?.bitrate">
              · {{ player.currentTrack.metadata.bitrate }}kbps</template
            >
            <template v-if="player.currentTrack.metadata?.sampleRate">
              · {{ player.currentTrack.metadata.sampleRate / 1000 }}kHz</template
            >
          </span>
          <span
            v-if="player.shuffle"
            class="flex items-center text-primary"
            :title="$t('status.shuffle')"
          >
            <Shuffle :size="11" />
          </span>
          <span
            v-if="player.repeat !== 'none'"
            class="flex items-center text-primary"
            :title="$t(player.repeat === 'one' ? 'status.repeatOne' : 'status.repeat')"
          >
            <Repeat2 v-if="player.repeat === 'one'" :size="11" />
            <Repeat v-else :size="11" />
          </span>
          <span
            v-if="player.equalizerVisible"
            class="flex items-center text-primary"
            :title="$t('status.eq')"
          >
            <SlidersHorizontal :size="11" />
          </span>
          <span v-if="queuePosition" class="font-mono">
            {{ t('status.queuePos', { cur: queuePosition, total: player.queueLength }) }}
          </span>
          <span
            v-if="showProgress"
            class="w-10 h-1 rounded-full bg-base-300 overflow-hidden"
            :title="$t('status.progress')"
          >
            <span
              class="block h-full rounded-full bg-primary transition-[width] duration-500"
              :style="{ width: progressPct + '%' }"
            />
          </span>
        </template>
        <span v-else>{{ $t('status.noMedia') }}</span>
      </div>
    </template>
    <template v-if="hasSection('separator') && hasSection('playing')">
      <div class="h-3 w-px bg-base-300" />
    </template>
    <template v-if="hasSection('viewCounts') && viewCounts.length">
      <span v-for="s in viewCounts" :key="s.label">{{ s.count }} {{ s.label }}</span>
    </template>
    <template v-if="hasSection('viewCounts') && viewContext.length">
      <span v-for="c in viewContext" :key="c" class="text-base-content/60">{{ c }}</span>
    </template>
    <div class="flex-1" />
    <template v-if="hasSection('downloads') && activeDownload">
      <span
        class="flex items-center gap-1.5 cursor-pointer rounded-sm px-0.5 -mx-0.5 hover:bg-base-content/5"
        :title="$t('status.openDownloads')"
        @click="goTo('/downloads')"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        {{ activeDownload.title }} {{ activeDownload.progress }}%
      </span>
    </template>
    <template v-if="hasSection('youtube')">
      <span
        class="flex items-center gap-1.5 cursor-pointer rounded-sm px-0.5 -mx-0.5 hover:bg-base-content/5"
        :title="$t('status.openOnline')"
        @click="goTo('/online')"
      >
        <span
          class="w-1.5 h-1.5 rounded-full"
          :class="status.loggedIn ? 'bg-success' : 'bg-base-300'"
        />
        {{ status.loggedIn ? $t('status.loggedIn') : $t('status.notLoggedIn') }}
      </span>
    </template>
    <template v-if="hasSection('dependencies') && depsText">
      <span
        class="cursor-pointer rounded-sm px-0.5 -mx-0.5 hover:bg-base-content/5"
        :title="$t('status.openDependencies')"
        @click="goTo('/settings?tab=dependencies')"
      >
        {{ depsText }}
      </span>
    </template>
    <template v-if="hasSection('version') && info">
      <span
        class="text-base-content/60 cursor-pointer rounded-sm px-0.5 -mx-0.5 hover:bg-base-content/5"
        :title="$t('status.openAbout')"
        @click="goTo('/settings?tab=about')"
      >
        Onda v{{ info.appVersion }}
      </span>
    </template>
    <template v-if="hasSection('clock')">
      <span class="font-mono" :title="$t('status.clockHint')">{{ clockText }}</span>
    </template>
  </div>
</template>