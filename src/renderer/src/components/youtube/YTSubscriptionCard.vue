<script setup lang="ts">
import { ref, watch } from 'vue';
import { Tv2, Download, RefreshCw, SlidersHorizontal, X } from '@lucide/vue';
import YTButton from './YTButton.vue';
import YTIconButton from './YTIconButton.vue';
import YTBadge from './YTBadge.vue';
import type { Subscription } from '@renderer/types/youtube';

const props = defineProps<{
  sub: Subscription;
  loadingChannelId?: string | null;
  queueingChannelId?: string | null;
}>();

const emit = defineEmits<{
  openChannel: [channelId: string];
  downloadAll: [sub: Subscription];
  checkNow: [channelId: string];
  toggleAutoDownload: [channelId: string, enabled: boolean];
  openPrefs: [sub: Subscription];
  unfollow: [channelId: string];
}>();

const avatarFailed = ref(false);

watch(
  () => [props.sub.channelId, props.sub.channelThumbnail],
  () => {
    avatarFailed.value = false;
  }
);

function lastCheckedLabel(ts?: number): string {
  return ts ? new Date(ts).toLocaleString() : '';
}
</script>

<template>
  <div
    class="flex flex-col p-4 rounded-2xl bg-bg-surface border border-border-default transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-border-subtle"
  >
    <div class="flex items-center gap-3">
      <button
        class="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-bg-elevated"
        :title="sub.channelTitle"
        @click="emit('openChannel', sub.channelId)"
      >
        <img
          v-if="sub.channelThumbnail && !avatarFailed"
          :src="sub.channelThumbnail"
          :alt="sub.channelTitle"
          class="w-full h-full object-cover"
          @error="avatarFailed = true"
        />
        <Tv2 v-else :size="22" class="w-full h-full p-3 text-fg-faint" />
      </button>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="text-sm font-semibold text-fg-base truncate hover:text-accent-base transition-colors"
            @click="emit('openChannel', sub.channelId)"
          >
            {{ sub.channelTitle }}
          </button>
          <YTBadge v-if="sub.pendingCount" variant="green" size="sm">
            {{ $t('youtube.remainingCount', { count: sub.pendingCount }) }}
          </YTBadge>
          <YTBadge v-if="sub.newArrivals" variant="amber" size="sm">
            {{ $t('youtube.newCount', { count: sub.newArrivals }) }}
          </YTBadge>
        </div>
        <p class="text-[11px] text-fg-faint mt-0.5">
          <template v-if="sub.lastChecked">
            {{ $t('youtube.lastChecked') }} {{ lastCheckedLabel(sub.lastChecked) }}
          </template>
          <template v-else>{{ $t('youtube.notCheckedYet') }}</template>
        </p>
      </div>
    </div>

    <div class="mt-auto pt-3 flex items-center gap-2 flex-wrap">
      <label
        class="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer select-none"
        :title="$t('youtube.autoDownloadTitle')"
      >
        <input
          type="checkbox"
          class="accent-accent-base w-4 h-4 rounded"
          :checked="sub.autoDownload"
          @change="
            emit('toggleAutoDownload', sub.channelId, ($event.target as HTMLInputElement).checked)
          "
        />
        <span>{{ $t('youtube.autoDownload') }}</span>
      </label>
      <div class="flex-1" />
      <YTButton
        variant="primary"
        size="sm"
        :disabled="queueingChannelId === sub.channelId"
        :title="$t('youtube.downloadAllTitle')"
        @click="emit('downloadAll', sub)"
      >
        <RefreshCw v-if="queueingChannelId === sub.channelId" :size="12" class="animate-spin" />
        <Download v-else :size="12" />
        {{
          queueingChannelId === sub.channelId
            ? $t('youtube.downloading')
            : $t('youtube.downloadAll')
        }}
      </YTButton>
      <YTIconButton
        :disabled="loadingChannelId === sub.channelId"
        :title="$t('youtube.checkChannelNow')"
        @click="emit('checkNow', sub.channelId)"
      >
        <RefreshCw :size="14" :class="loadingChannelId === sub.channelId ? 'animate-spin' : ''" />
      </YTIconButton>
      <YTIconButton :title="$t('youtube.downloadPrefs')" @click="emit('openPrefs', sub)">
        <SlidersHorizontal :size="14" />
      </YTIconButton>
      <YTIconButton
        variant="danger"
        :title="$t('youtube.unsubscribeChannel')"
        @click="emit('unfollow', sub.channelId)"
      >
        <X :size="14" />
      </YTIconButton>
    </div>
  </div>
</template>
