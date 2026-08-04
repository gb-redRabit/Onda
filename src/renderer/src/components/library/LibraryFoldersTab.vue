<script setup lang="ts">
import { computed, ref } from 'vue';
import { Music2, Folder, ChevronDown } from '@lucide/vue';
import { useLibraryStore } from '@renderer/stores/library';
import DirNode from '@renderer/components/library/DirNode.vue';

const library = useLibraryStore();

const props = defineProps<{
  query: string;
}>();
const emit = defineEmits<{
  playFolder: [folderPath: string];
}>();

const expandedPaths = ref(new Set<string>());

function togglePath(fp: string) {
  const s = new Set(expandedPaths.value);
  if (s.has(fp)) s.delete(fp);
  else s.add(fp);
  expandedPaths.value = s;
}

let folderCountsSig = '';
let folderCountsCache: Map<string, number> | null = null;

const folderFileCounts = computed(() => {
  const folders = library.folders;
  if (folders.length === 0) return new Map<string, number>();

  let h = 0x811c9dc5;
  for (const track of library.tracks) {
    const p = track.path;
    for (let j = 0; j < p.length; j++) {
      h ^= p.charCodeAt(j);
      h = (h * 0x01000193) >>> 0;
    }
    h = (h ^ (h >>> 16)) >>> 0;
  }
  const sig = `f:${folders.join('\u0000')}|h:${h}`;
  if (folderCountsSig === sig && folderCountsCache) return folderCountsCache;

  const counts = new Map<string, number>();
  const normalizedToOriginal = new Map<string, string>();
  for (const fp of folders) normalizedToOriginal.set(fp.replace(/\\/g, '/'), fp);
  for (const track of library.tracks) {
    const normPath = track.path.replace(/\\/g, '/');
    let seenKey: string | null = null;
    for (let idx = normPath.lastIndexOf('/'); idx > 0; idx = normPath.lastIndexOf('/', idx - 1)) {
      const ancestor = normPath.slice(0, idx);
      const originalKey = normalizedToOriginal.get(ancestor);
      if (originalKey && originalKey !== seenKey) {
        counts.set(originalKey, (counts.get(originalKey) || 0) + 1);
        seenKey = originalKey;
      }
    }
  }

  folderCountsSig = sig;
  folderCountsCache = counts;
  return counts;
});

const allFolderTracks = computed(() => {
  const q = props.query.toLowerCase();
  return library.tracks.filter(
    (track) => !q || track.name.toLowerCase().includes(q) || track.path.toLowerCase().includes(q)
  );
});

function dirName(fp: string): string {
  return fp.split('\\').pop() || fp;
}

function folderTypeIcon(type: string): string {
  if (type === 'audio') return '🎵';
  if (type === 'video') return '🎬';
  if (type === 'image') return '🖼️';
  return '📁';
}
</script>

<template>
  <div
    v-if="allFolderTracks.length === 0"
    class="flex flex-col items-center justify-center h-full gap-3 text-fg-faint"
  >
    <Folder :size="48" class="opacity-30" />
    <p class="text-sm">{{ $t('library.noFolders') }}</p>
    <p class="text-xs">{{ $t('library.addFolderHint') }}</p>
  </div>
  <div v-else class="p-3 space-y-3">
    <div
      v-for="folderPath in library.folders"
      :key="folderPath"
      class="rounded-xl bg-bg-elevated border border-border-default overflow-hidden"
    >
      <button
        class="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-hover transition-colors"
        @click="togglePath(folderPath)"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="text-lg shrink-0">{{ folderTypeIcon(library.getFolderType(folderPath)) }}</span>
          <div class="min-w-0 text-left">
            <div class="text-sm font-medium">{{ dirName(folderPath) }}</div>
            <div class="text-xs text-fg-faint truncate">
              {{ folderPath }} · {{ folderFileCounts.get(folderPath) || 0 }} {{ $t('library.folderFiles') }}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-ghost text-accent-base text-xs font-medium hover:bg-accent-base hover:text-white transition-colors"
            @click.stop="emit('playFolder', folderPath)"
          >
            <Music2 :size="12" /> {{ $t('folders.play') }}
          </button>
          <ChevronDown
            :size="16"
            class="text-fg-faint transition-transform duration-200"
            :class="expandedPaths.has(folderPath) ? '' : '-rotate-90'"
          />
        </div>
      </button>
      <div v-if="expandedPaths.has(folderPath)" class="border-t border-border-default">
        <DirNode
          :dir="folderPath"
          :depth="0"
          :expanded-paths="expandedPaths"
          @toggle="togglePath"
        />
      </div>
    </div>
  </div>
</template>