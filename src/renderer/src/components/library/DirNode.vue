<script setup lang="ts">
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import { ChevronDown, Folder } from '@lucide/vue';
import LibraryTrackRow from './LibraryTrackRow.vue';

defineProps<{
  dir: string;
  depth: number;
  expandedPaths: Set<string>;
}>();

const emit = defineEmits<{
  toggle: [path: string];
}>();

const library = useLibraryStore();
const player = usePlayerStore();

function getChildDirs(fp: string): string[] {
  const dirs = new Set<string>();
  const prefix = fp + '\\';
  for (const t of library.tracks) {
    if (!t.path.startsWith(prefix)) continue;
    const rel = t.path.slice(prefix.length);
    const idx = rel.indexOf('\\');
    if (idx > 0) dirs.add(rel.slice(0, idx));
  }
  return [...dirs].sort();
}

function getTracksInDir(fp: string): typeof library.tracks {
  const prefix = fp + '\\';
  return library.tracks.filter((t) => t.path.startsWith(prefix));
}

function getDirectTracksInDir(fp: string): typeof library.tracks {
  const prefix = fp + '\\';
  return library.tracks.filter((t) => {
    if (!t.path.startsWith(prefix)) return false;
    const rel = t.path.slice(prefix.length);
    return !rel.includes('\\');
  });
}

function playDir(fp: string) {
  const tracks = library.tracks.filter((t) => t.path.startsWith(fp));
  if (tracks.length === 0) return;
  player.clearQueue();
  player.addToQueueMultiple(tracks);
  player.setTrack(tracks[0]);
  player.play();
}
</script>

<template>
  <div class="divide-y divide-border-default">
    <div v-for="sub in getChildDirs(dir)" :key="sub">
      <button
        class="w-full flex items-center gap-2 px-4 py-2 text-xs text-fg-muted hover:bg-bg-hover transition-colors"
        :style="{ paddingLeft: 16 + depth * 20 + 'px' }"
        @click="emit('toggle', dir + '\\' + sub)"
      >
        <ChevronDown
          :size="12"
          class="transition-transform duration-200 shrink-0"
          :class="expandedPaths.has(dir + '\\' + sub) ? '' : '-rotate-90'"
        />
        <Folder :size="12" class="shrink-0" />
        <span>{{ sub }}</span>
        <span class="text-fg-faint ml-auto">{{ getTracksInDir(dir + '\\' + sub).length }}</span>
        <span class="text-[10px] text-fg-faint/40 ml-0.5">{{ $t('library.files') }}</span>
        <span
          class="ml-1 p-0.5 rounded text-fg-faint/50 hover:text-accent-base transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
          :title="$t('folders.play')"
          @click.stop="playDir(dir + '\\' + sub)"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </span>
      </button>
      <div v-if="expandedPaths.has(dir + '\\' + sub)">
        <DirNode
          :dir="dir + '\\' + sub"
          :depth="depth + 1"
          :expanded-paths="expandedPaths"
          @toggle="emit('toggle', $event)"
        />
        <div class="divide-y divide-border-default">
          <LibraryTrackRow
            v-for="t in getDirectTracksInDir(dir + '\\' + sub)"
            :key="t.path"
            :track="t"
            :show-playlist="true"
          />
        </div>
      </div>
    </div>
    <div v-if="getDirectTracksInDir(dir).length > 0" class="divide-y divide-border-default">
      <LibraryTrackRow
        v-for="t in getDirectTracksInDir(dir)"
        :key="t.path"
        :track="t"
        :show-playlist="true"
      />
    </div>
  </div>
</template>
