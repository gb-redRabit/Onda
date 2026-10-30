<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Tv2, Download, RefreshCw, MoreHorizontal } from '@lucide/vue';
import OnlineButton from './OnlineButton.vue';
import OnlineIconButton from './OnlineIconButton.vue';
import OnlineBadge from './OnlineBadge.vue';
import Switch from '@renderer/components/ui/Switch.vue';
import { useContextMenu, type ContextMenuAction } from '@renderer/composables/useContextMenu';
import { useRemoteImage } from '@renderer/composables/useRemoteImage';
import { relativeTime } from '@renderer/utils/relativeTime';
import { buildSoundcloudProfileUrl, buildYouTubeChannelUrl } from '@shared/provider';
import type { Subscription } from '@renderer/types/online';

const props = defineProps<{
  sub: Subscription;
  loadingChannelId?: string | null;
  isQueuing?: (channelId: string) => boolean;
}>();

const emit = defineEmits<{
  openChannel: [channelId: string];
  downloadAll: [sub: Subscription];
  checkNow: [channelId: string];
  toggleAutoDownload: [channelId: string, enabled: boolean];
  openPrefs: [sub: Subscription];
  unfollow: [channelId: string];
}>();

const { t, locale } = useI18n();
const { open, openAt } = useContextMenu();

const channelUrl = computed(() =>
  props.sub.platform === 'soundcloud'
    ? buildSoundcloudProfileUrl(props.sub.channelId)
    : buildYouTubeChannelUrl(props.sub.channelId)
);

function copyChannelUrl() {
  void window.api?.invoke('fs:copyPath', channelUrl.value);
}

function menuDefs(): ContextMenuAction<Subscription>[] {
  return [
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
      disabledWhen: (s) => props.isQueuing?.(s.channelId) ?? false,
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
}

function openMenu(e: MouseEvent) {
  open(e, menuDefs(), props.sub);
}

function openActions(e: MouseEvent) {
  openAt(e.currentTarget as HTMLElement, menuDefs(), props.sub);
}

const avatarFailed = ref(false);
const avatarSrc = useRemoteImage(computed(() => props.sub.channelThumbnail));

watch(
  () => props.sub.channelId,
  () => {
    avatarFailed.value = false;
  }
);

function lastCheckedLabel(ts?: number): string {
  return ts ? relativeTime(ts, locale.value) : t('youtube.notCheckedYet');
}

const autoDownload = computed({
  get: () => props.sub.autoDownload,
  set: (enabled: boolean) => emit('toggleAutoDownload', props.sub.channelId, enabled)
});
</script>

<template>
  <div
    data-testid="online-subscription-card"
    class="cv-card flex flex-col p-4 rounded-box bg-base-100 border border-base-300 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-base-300"
    @contextmenu="openMenu"
  >
    <div class="flex items-center gap-3">
      <button
        class="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-base-100"
        :title="sub.channelTitle"
        @click="emit('openChannel', sub.channelId)"
      >
        <img
          v-if="avatarSrc && !avatarFailed"
          :src="avatarSrc"
          :alt="sub.channelTitle"
          class="w-full h-full object-cover"
          @error="avatarFailed = true"
        />
        <Tv2 v-else :size="22" class="w-full h-full p-3 text-base-content/50" />
      </button>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="text-sm font-semibold text-base-content truncate hover:text-primary-text transition-colors"
            @click="emit('openChannel', sub.channelId)"
          >
            {{ sub.channelTitle }}
          </button>
          <OnlineBadge variant="default" size="sm">{{
            sub.platform === 'soundcloud' ? 'SC' : 'YT'
          }}</OnlineBadge>
          <OnlineBadge v-if="sub.pendingCount" variant="green" size="sm">
            {{ $t('youtube.remainingCount', { count: sub.pendingCount }) }}
          </OnlineBadge>
          <OnlineBadge v-if="sub.newArrivals" variant="amber" size="sm">
            {{ $t('youtube.newCount', { count: sub.newArrivals }) }}
          </OnlineBadge>
        </div>
        <p class="text-2xs text-base-content/50 mt-0.5">
          <template v-if="sub.lastChecked">
            {{ $t('youtube.lastChecked') }} {{ lastCheckedLabel(sub.lastChecked) }}
          </template>
          <template v-else>{{ $t('youtube.notCheckedYet') }}</template>
        </p>
      </div>
    </div>

    <div class="mt-auto space-y-2 pt-3">
      <div class="flex items-center gap-1.5 text-xs text-base-content/70">
        <Switch
          v-model="autoDownload"
          size="sm"
          :label="$t('youtube.autoDownload')"
          :title="$t('youtube.autoDownloadTitle')"
        />
        <span>{{ $t('youtube.autoDownload') }}</span>
      </div>
      <div class="flex items-center gap-2">
        <OnlineButton
          variant="primary"
          size="sm"
          :disabled="isQueuing?.(sub.channelId) ?? false"
          :title="$t('youtube.downloadAllTitle')"
          @click="emit('downloadAll', sub)"
        >
          <RefreshCw v-if="isQueuing?.(sub.channelId)" :size="12" class="animate-spin" />
          <Download v-else :size="12" />
          {{ isQueuing?.(sub.channelId) ? $t('youtube.downloading') : $t('youtube.downloadAll') }}
        </OnlineButton>
        <div class="flex-1" />
        <OnlineIconButton
          :disabled="loadingChannelId === sub.channelId"
          :title="$t('youtube.checkChannelNow')"
          @click="emit('checkNow', sub.channelId)"
        >
          <RefreshCw :size="14" :class="loadingChannelId === sub.channelId ? 'animate-spin' : ''" />
        </OnlineIconButton>
        <OnlineIconButton
          data-testid="subscription-actions"
          :title="$t('common.moreActions')"
          @click="openActions"
        >
          <MoreHorizontal :size="14" />
        </OnlineIconButton>
      </div>
    </div>
  </div>
</template>
