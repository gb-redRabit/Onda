<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Tv2, Download, RefreshCw, SlidersHorizontal, X } from '@lucide/vue';
import OnlineButton from './OnlineButton.vue';
import OnlineIconButton from './OnlineIconButton.vue';
import OnlineBadge from './OnlineBadge.vue';
import { useContextMenu, type ContextMenuAction } from '@renderer/composables/useContextMenu';
import type { Subscription } from '@renderer/types/online';

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

const { t } = useI18n();
const { open } = useContextMenu();

const channelUrl = computed(() =>
  props.sub.platform === 'soundcloud'
    ? `https://soundcloud.com/${props.sub.channelId}`
    : `https://www.youtube.com/channel/${props.sub.channelId}`
);

function copyChannelUrl() {
  void window.api?.invoke('fs:copyPath', channelUrl.value);
}

function openMenu(e: MouseEvent) {
  const defs: ContextMenuAction<Subscription>[] = [
    {
      label: t('ctx.online.openChannel'),
      action: (s) => emit('openChannel', s.channelId)
    },
    {
      label: t('ctx.online.copyChannelUrl'),
      action: () => copyChannelUrl()
    },
    { separator: true, label: '' },
    {
      label: t('ctx.online.checkNow'),
      disabledWhen: (s) => props.loadingChannelId === s.channelId,
      action: (s) => emit('checkNow', s.channelId)
    },
    {
      label: t('ctx.online.downloadAll'),
      disabledWhen: (s) => props.queueingChannelId === s.channelId,
      action: (s) => emit('downloadAll', s)
    },
    {
      label: `${props.sub.autoDownload ? '✓ ' : ''}${t('youtube.autoDownload')}`,
      action: (s) => emit('toggleAutoDownload', s.channelId, !s.autoDownload)
    },
    {
      label: t('ctx.online.prefs'),
      action: (s) => emit('openPrefs', s)
    },
    { separator: true, label: '' },
    {
      label: t('ctx.online.unfollow'),
      action: (s) => emit('unfollow', s.channelId)
    }
  ];
  open(e, defs, props.sub);
}

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
    class="flex flex-col p-4 rounded-box bg-base-100 border border-base-300 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-base-300"
    @contextmenu="openMenu"
  >
    <div class="flex items-center gap-3">
      <button
        class="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-base-100"
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
        <Tv2 v-else :size="22" class="w-full h-full p-3 text-base-content/50" />
      </button>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="text-sm font-semibold text-base-content truncate hover:text-primary transition-colors"
            @click="emit('openChannel', sub.channelId)"
          >
            {{ sub.channelTitle }}
          </button>
          <OnlineBadge v-if="sub.platform === 'soundcloud'" variant="amber" size="sm"
            >SC</OnlineBadge
          >
          <OnlineBadge v-else-if="sub.platform === 'youtube'" variant="accent" size="sm"
            >YT</OnlineBadge
          >
          <OnlineBadge v-if="sub.pendingCount" variant="green" size="sm">
            {{ $t('youtube.remainingCount', { count: sub.pendingCount }) }}
          </OnlineBadge>
          <OnlineBadge v-if="sub.newArrivals" variant="amber" size="sm">
            {{ $t('youtube.newCount', { count: sub.newArrivals }) }}
          </OnlineBadge>
        </div>
        <p class="text-[11px] text-base-content/50 mt-0.5">
          <template v-if="sub.lastChecked">
            {{ $t('youtube.lastChecked') }} {{ lastCheckedLabel(sub.lastChecked) }}
          </template>
          <template v-else>{{ $t('youtube.notCheckedYet') }}</template>
        </p>
      </div>
    </div>

    <div class="mt-auto pt-3 flex items-center gap-2 flex-wrap">
      <label
        class="flex items-center gap-1.5 text-xs text-base-content/70 cursor-pointer select-none"
        :title="$t('youtube.autoDownloadTitle')"
      >
        <input
          type="checkbox"
          class="accent-primary"
          :checked="sub.autoDownload"
          @change="
            emit('toggleAutoDownload', sub.channelId, ($event.target as HTMLInputElement).checked)
          "
        />
        <span>{{ $t('youtube.autoDownload') }}</span>
      </label>
      <div class="flex-1" />
      <OnlineButton
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
      </OnlineButton>
      <OnlineIconButton
        :disabled="loadingChannelId === sub.channelId"
        :title="$t('youtube.checkChannelNow')"
        @click="emit('checkNow', sub.channelId)"
      >
        <RefreshCw :size="14" :class="loadingChannelId === sub.channelId ? 'animate-spin' : ''" />
      </OnlineIconButton>
      <OnlineIconButton :title="$t('youtube.downloadPrefs')" @click="emit('openPrefs', sub)">
        <SlidersHorizontal :size="14" />
      </OnlineIconButton>
      <OnlineIconButton
        variant="danger"
        :title="$t('youtube.unsubscribeChannel')"
        @click="emit('unfollow', sub.channelId)"
      >
        <X :size="14" />
      </OnlineIconButton>
    </div>
  </div>
</template>
