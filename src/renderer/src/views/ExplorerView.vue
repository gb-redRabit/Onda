<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  List,
  Home,
  HardDrive,
  FolderOpen,
  Music2,
  Film
} from '@lucide/vue'
import { useExplorerStore } from '@renderer/stores/explorer'
import { usePlayerStore } from '@renderer/stores/player'
import { moduleManager } from '@renderer/modules/ModuleManager'
import { formatFileSize } from '@renderer/utils/formatters'
import { getFileTypeInfo } from '@renderer/utils/fileTypes'
import type { FileItem } from '@renderer/types/explorer'
import type { MediaFile } from '@renderer/types/media'

const explorer = useExplorerStore()
const player = usePlayerStore()
const router = useRouter()

const MEDIA_EXTS = new Set([
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.aac',
  '.m4a',
  '.opus',
  '.aiff',
  '.mp4',
  '.mkv',
  '.avi',
  '.webm',
  '.mov',
  '.wmv',
  '.flv',
  '.m4v'
])

onMounted(() => {
  moduleManager.switchTo('explorer')
  if (!explorer.currentPath) {
    explorer.navigateTo('')
  }
})

function handleDoubleClick(item: FileItem) {
  if (item.isDirectory) {
    explorer.navigateTo(item.path)
  } else if (item.extension && MEDIA_EXTS.has(item.extension)) {
    const extVideo = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v']
    const isVideo = extVideo.includes(item.extension)
    const track: MediaFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path: item.path,
      name: item.name,
      type: isVideo ? 'video' : 'audio',
      size: item.size,
      duration: 0,
      extension: item.extension,
      mimeType: '',
      addedAt: Date.now(),
      playCount: 0
    }
    player.setTrack(track)
    if (isVideo) router.push('/player')
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- toolbar -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-base">
      <div class="flex gap-0.5">
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover disabled:opacity-30 transition-colors"
          :disabled="!explorer.canGoBack"
          @click="explorer.goBack"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover disabled:opacity-30 transition-colors"
          :disabled="!explorer.canGoForward"
          @click="explorer.goForward"
        >
          <ChevronRight :size="16" />
        </button>
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover disabled:opacity-30 transition-colors"
          :disabled="!explorer.canGoUp"
          @click="explorer.goUp"
        >
          <ChevronUp :size="16" />
        </button>
      </div>

      <!-- address bar -->
      <div
        class="flex-1 flex items-center gap-0.5 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs overflow-hidden"
      >
        <button
          class="shrink-0 p-0.5 text-fg-faint hover:text-fg-base transition-colors"
          @click="explorer.navigateTo('')"
        >
          <Home :size="12" />
        </button>
        <template v-if="explorer.currentPath">
          <template
            v-for="(part, idx) in explorer.currentPath
              .replace(/\\\\/g, '/')
              .split('/')
              .filter(Boolean)"
            :key="idx"
          >
            <span class="text-fg-faint">/</span>
            <button
              class="px-1 py-0.5 rounded hover:bg-bg-hover text-fg-muted hover:text-fg-base transition-colors truncate max-w-30"
              @click="
                explorer.navigateTo(
                  explorer.currentPath
                    .replace(/\\\\/g, '/')
                    .split('/')
                    .filter(Boolean)
                    .slice(0, idx + 1)
                    .join('/')
                )
              "
            >
              {{ part }}
            </button>
          </template>
        </template>
        <span v-else class="text-fg-faint px-1">Ten komputer</span>
      </div>

      <div class="flex gap-0.5">
        <button
          class="p-1.5 rounded-lg transition-colors"
          :class="
            explorer.viewMode === 'grid'
              ? 'text-accent-base bg-accent-ghost'
              : 'text-fg-faint hover:bg-bg-hover'
          "
          @click="explorer.viewMode = 'grid'"
        >
          <LayoutGrid :size="14" />
        </button>
        <button
          class="p-1.5 rounded-lg transition-colors"
          :class="
            explorer.viewMode === 'list'
              ? 'text-accent-base bg-accent-ghost'
              : 'text-fg-faint hover:bg-bg-hover'
          "
          @click="explorer.viewMode = 'list'"
        >
          <List :size="14" />
        </button>
      </div>
    </div>

    <!-- content -->
    <div class="flex-1 overflow-auto p-3">
      <div v-if="explorer.isLoading" class="flex justify-center py-16">
        <div
          class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
        />
      </div>
      <div
        v-else-if="explorer.sortedFiles.length === 0"
        class="flex flex-col items-center justify-center py-16 text-fg-faint"
      >
        <FolderOpen :size="48" class="mb-3 opacity-30" />
        <p class="text-sm">Ten folder jest pusty</p>
      </div>

      <!-- drives header -->
      <div v-if="explorer.isAtDrives && explorer.sortedFiles.length > 0" class="mb-3">
        <h3
          class="text-xs font-medium text-fg-faint uppercase tracking-wider flex items-center gap-2 px-1"
        >
          <HardDrive :size="12" />
          Dyski
        </h3>
      </div>

      <!-- grid -->
      <div
        v-if="explorer.viewMode === 'grid'"
        class="grid grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2"
      >
        <button
          v-for="item in explorer.sortedFiles"
          :key="item.path"
          class="flex flex-col items-center p-3 rounded-xl hover:bg-bg-hover transition-colors text-center group"
          :class="{
            'bg-accent-ghost ring-1 ring-accent-base': explorer.selectedFiles.has(item.path)
          }"
          @click="explorer.toggleSelect(item.path)"
          @dblclick="handleDoubleClick(item)"
        >
          <div
            class="w-14 h-14 rounded-lg flex items-center justify-center mb-1.5"
            :class="explorer.isAtDrives ? 'bg-accent-ghost' : 'bg-bg-overlay'"
          >
            <HardDrive v-if="explorer.isAtDrives" :size="26" class="text-accent-base" />
            <FolderOpen v-else-if="item.isDirectory" :size="26" class="text-accent-base" />
            <component
              :is="getFileTypeInfo(item.extension || '').category === 'video' ? Film : Music2"
              v-else
              :size="22"
              :style="{ color: getFileTypeInfo(item.extension || '').color }"
            />
          </div>
          <span class="text-[11px] truncate w-full leading-tight font-medium">{{ item.name }}</span>
          <span v-if="explorer.isAtDrives && item.size > 0" class="text-[10px] text-fg-faint">{{
            formatFileSize(item.size)
          }}</span>
        </button>
      </div>

      <!-- list -->
      <div v-else>
        <div
          class="grid grid-cols-[1fr_120px_100px_100px] gap-2 px-3 py-2 text-[11px] text-fg-faint font-medium uppercase tracking-wider border-b border-border-default mb-1 sticky top-0 bg-bg-base z-10"
        >
          <button
            class="text-left flex items-center gap-1 hover:text-fg-base"
            @click="explorer.toggleSort('name')"
          >
            Nazwa
            <ChevronUp
              v-if="explorer.sortBy === 'name' && explorer.sortOrder === 'asc'"
              :size="10"
            />
            <ChevronDown
              v-if="explorer.sortBy === 'name' && explorer.sortOrder === 'desc'"
              :size="10"
            />
          </button>
          <span>Rozmiar</span>
          <span>Typ</span>
          <span class="text-right">Zmodyfikowany</span>
        </div>
        <button
          v-for="item in explorer.sortedFiles"
          :key="item.path"
          class="w-full grid grid-cols-[1fr_120px_100px_100px] gap-2 px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors text-left items-center text-sm group"
          :class="{
            'bg-accent-ghost ring-1 ring-accent-base': explorer.selectedFiles.has(item.path)
          }"
          @click="explorer.toggleSelect(item.path)"
          @dblclick="handleDoubleClick(item)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <HardDrive v-if="explorer.isAtDrives" :size="14" class="text-accent-base shrink-0" />
            <FolderOpen v-else-if="item.isDirectory" :size="14" class="text-accent-base shrink-0" />
            <component
              :is="getFileTypeInfo(item.extension || '').category === 'video' ? Film : Music2"
              v-else
              :size="14"
              :style="{ color: getFileTypeInfo(item.extension || '').color }"
              class="shrink-0"
            />
            <span class="truncate">{{ item.name }}</span>
          </div>
          <span class="text-fg-faint text-xs font-mono">
            {{
              explorer.isAtDrives
                ? item.size > 0
                  ? formatFileSize(item.size)
                  : '—'
                : item.isDirectory
                  ? '—'
                  : formatFileSize(item.size)
            }}
          </span>
          <span class="text-fg-faint text-xs">{{
            item.extension || (explorer.isAtDrives ? 'Dysk' : '—')
          }}</span>
          <span class="text-fg-faint text-xs text-right font-mono">{{
            new Date(item.modifiedAt).toLocaleDateString()
          }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
