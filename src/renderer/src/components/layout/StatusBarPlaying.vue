<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Shuffle, Repeat, Repeat2, SlidersHorizontal } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';

const emit = defineEmits<{
  open: [path: string];
}>();

const { t } = useI18n();
const player = usePlayerStore();
const audio = useAudioPlayer();

// The status bar's "playing" section should open the AUDIO player for music
// and streams — only video goes to the video player (/player).
const playingTarget = computed(() => {
  const type = player.currentTrack?.type ?? player.streamPending?.type;
  return type === 'video' ? '/player' : '/audio';
});

const queuePosition = computed(() => {
  if (!player.currentTrack) return 0;
  const idx = player.displayQueue.findIndex((x) => x.path === player.currentTrack?.path);
  return idx >= 0 ? idx + 1 : 0;
});
</script>

<template>
  <div
    class="flex items-center gap-1.5 cursor-pointer group rounded-sm px-0.5 -mx-0.5 hover:bg-base-content/5"
    :title="$t('status.playlistHint')"
    @click="emit('open', playingTarget)"
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
    </template>
    <span v-else>{{ $t('status.noMedia') }}</span>
  </div>
</template>
