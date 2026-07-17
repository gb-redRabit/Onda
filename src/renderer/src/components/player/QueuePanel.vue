<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePlayerStore } from '@renderer/stores/player'
import { X, Music2, GripVertical, Trash2 } from '@lucide/vue'
import { formatDuration } from '@renderer/utils/formatters'
import type { MediaFile } from '@renderer/types/media'

const player = usePlayerStore()
const dragOverIndex = ref<number | null>(null)
const dragIndex = ref<number | null>(null)

async function loadCovers(tracks: MediaFile[]) {
  for (const track of tracks) {
    if (!player.getCover(track.path)) {
      player.loadCover(track.path)
    }
  }
}

watch(
  () => player.queue,
  (newQueue) => {
    loadCovers(newQueue)
  },
  { immediate: true }
)

watch(
  () => player.currentTrack,
  (track) => {
    if (track) player.loadCover(track.path)
  },
  { immediate: true }
)

function onDragStart(e: DragEvent, index: number) {
  dragIndex.value = index
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', `queue:${index}`)
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(e: DragEvent, toIndex: number) {
  e.preventDefault()
  dragOverIndex.value = null
  const data = e.dataTransfer!.getData('text/plain')

  if (data.startsWith('queue:')) {
    const fromIndex = parseInt(data.split(':')[1])
    if (fromIndex !== toIndex) {
      player.reorderQueue(fromIndex, toIndex)
    }
  } else if (data.startsWith('file:')) {
    const filePath = data.replace('file:', '')
    const file: MediaFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path: filePath,
      name: filePath.split(/[/\\]/).pop() || filePath,
      type: filePath.match(/\.(mp3|flac|wav|ogg|aac|m4a|opus|aiff)$/i) ? 'audio' : 'video',
      size: 0,
      duration: 0,
      extension: filePath.includes('.') ? filePath.split('.').pop() || '' : '',
      mimeType: '',
      addedAt: Date.now(),
      playCount: 0
    }
    player.insertInQueue(toIndex, file)
    window.api.getDuration(filePath).then((dur) => {
      file.duration = dur
    })
  }
}

function onFileDrop(e: DragEvent) {
  e.preventDefault()
  dragOverIndex.value = null
  const files = e.dataTransfer?.files
  if (!files) return
  for (const file of Array.from(files)) {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const isMedia = [
      'mp3',
      'flac',
      'wav',
      'ogg',
      'aac',
      'm4a',
      'opus',
      'aiff',
      'mp4',
      'mkv',
      'avi',
      'webm',
      'mov'
    ].includes(ext)
    if (isMedia) {
      const filePath = window.api.getFilePath(file)
      const mediaFile: MediaFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        path: filePath,
        name: file.name,
        type: ['mp4', 'mkv', 'avi', 'webm', 'mov'].includes(ext) ? 'video' : 'audio',
        size: file.size,
        duration: 0,
        extension: ext,
        mimeType: file.type || '',
        addedAt: Date.now(),
        playCount: 0
      }
      player.addToQueue(mediaFile)
      window.api.getDuration(filePath).then((dur) => {
        mediaFile.duration = dur
      })
    }
  }
}
</script>

<template>
  <div
    class="h-full flex flex-col bg-bg-surface border-l border-border-default"
    @dragover.prevent
    @drop="onFileDrop"
  >
    <div class="flex items-center justify-between px-4 py-3 border-b border-border-default">
      <h3 class="text-sm font-semibold flex items-center gap-2">
        <span>Kolejka</span>
        <span class="text-[11px] text-fg-faint font-normal">({{ player.queueLength }})</span>
      </h3>
      <div class="flex items-center gap-1">
        <button
          v-if="player.queue.length"
          class="text-[11px] text-fg-faint hover:text-red-base transition-colors px-2 py-1"
          @click="player.clearQueue"
        >
          Wyczyść
        </button>
        <button
          class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover hover:text-fg-base transition-colors"
          @click="player.toggleQueue"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- now playing -->
    <div v-if="player.currentTrack" class="px-4 py-3 border-b border-border-default bg-bg-elevated">
      <div class="text-[10px] text-accent-base font-medium uppercase tracking-wider mb-2">
        Teraz odtwarzane
      </div>
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg bg-accent-ghost flex items-center justify-center shrink-0 overflow-hidden"
        >
          <video
            v-if="player.getCover(player.currentTrack.path).type === 'video'"
            :src="'file:///' + player.getCover(player.currentTrack.path).data"
            class="w-full h-full object-cover"
            muted
            loop
            autoplay
          />
          <img
            v-else-if="player.getCover(player.currentTrack.path).type === 'image'"
            :src="player.getCover(player.currentTrack.path).data || ''"
            class="w-full h-full object-cover"
          />
          <Music2 v-else :size="16" class="text-accent-base" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate">
            {{ player.currentTrack.metadata?.title || player.currentTrack.name }}
          </div>
          <div class="text-xs text-fg-faint truncate">
            {{ player.currentTrack.metadata?.artist || 'Nieznany' }}
          </div>
        </div>
        <span class="text-xs text-fg-faint font-mono shrink-0">{{
          formatDuration(player.currentTrack.duration || 0)
        }}</span>
      </div>
    </div>

    <!-- drop hint when empty -->
    <div
      v-if="player.queue.length === 0"
      class="flex-1 flex flex-col items-center justify-center py-12 text-fg-faint"
    >
      <Music2 :size="32" class="mb-2 opacity-30" />
      <p class="text-xs">Kolejka jest pusta</p>
      <p class="text-[10px] text-fg-faint/50 mt-1">Upuść pliki tutaj aby dodać</p>
    </div>

    <!-- queue list with drag & drop -->
    <div v-else class="flex-1 overflow-auto">
      <div class="py-1">
        <div
          v-for="(track, i) in player.queue"
          :key="i"
          class="flex items-center gap-2 px-4 py-2 hover:bg-bg-hover transition-colors group cursor-pointer"
          :class="{ 'border-t-2 border-accent-base': dragOverIndex === i }"
          draggable="true"
          @dragstart="onDragStart($event, i)"
          @dragover="onDragOver($event, i)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, i)"
          @click="player.setTrack(track)"
        >
          <GripVertical
            :size="12"
            class="text-fg-faint/40 shrink-0 opacity-0 group-hover:opacity-100 cursor-grab"
          />
          <div
            class="w-8 h-8 rounded-md bg-bg-overlay flex items-center justify-center shrink-0 overflow-hidden"
          >
            <video
              v-if="player.getCover(track.path).type === 'video'"
              :src="'file:///' + player.getCover(track.path).data"
              class="w-full h-full object-cover"
              muted
              loop
            />
            <img
              v-else-if="player.getCover(track.path).type === 'image'"
              :src="player.getCover(track.path).data || ''"
              class="w-full h-full object-cover"
            />
            <Music2 v-else :size="12" class="text-fg-faint" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm truncate">{{ track.metadata?.title || track.name }}</div>
            <div class="text-[11px] text-fg-faint truncate">{{ track.metadata?.artist || '' }}</div>
          </div>
          <span class="text-[11px] text-fg-faint font-mono shrink-0">{{
            formatDuration(track.duration || 0)
          }}</span>
          <button
            class="p-1 rounded opacity-0 group-hover:opacity-100 text-fg-faint hover:text-red-base transition-all"
            @click.stop="player.removeFromQueue(i)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>
    </div>

    <!-- history -->
    <div
      v-if="player.history.length > 0"
      class="border-t border-border-default max-h-40 overflow-auto"
    >
      <div class="px-4 py-2 text-[10px] text-fg-faint font-medium uppercase tracking-wider">
        Historia
      </div>
      <div
        v-for="(track, i) in player.history.slice(0, 10)"
        :key="i"
        class="flex items-center gap-2 px-4 py-1.5 hover:bg-bg-hover transition-colors cursor-pointer opacity-60"
        @click="player.playFromHistory(i)"
      >
        <div
          class="w-6 h-6 rounded bg-bg-overlay flex items-center justify-center shrink-0 overflow-hidden"
        >
          <video
            v-if="player.getCover(track.path).type === 'video'"
            :src="'file:///' + player.getCover(track.path).data"
            class="w-full h-full object-cover"
            muted
            loop
          />
          <img
            v-else-if="player.getCover(track.path).type === 'image'"
            :src="player.getCover(track.path).data || ''"
            class="w-full h-full object-cover"
          />
          <Music2 v-else :size="10" class="text-fg-faint" />
        </div>
        <span class="text-xs truncate flex-1">{{ track.metadata?.title || track.name }}</span>
        <span class="text-[10px] text-fg-faint">{{ formatDuration(track.duration || 0) }}</span>
      </div>
    </div>
  </div>
</template>
