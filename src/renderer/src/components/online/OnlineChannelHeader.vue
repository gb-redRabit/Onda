<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ArrowLeft, Users, LayoutGrid, Rows3, Bell } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { formatNumber } from '@renderer/utils/formatters';
import { useRemoteImage } from '@renderer/composables/useRemoteImage';
import OnlineButton from './OnlineButton.vue';
import OnlineSegmentControl from './OnlineSegmentControl.vue';

const emit = defineEmits<{
  toggleFollow: [];
}>();

const yt = useOnlineStore();
const followed = computed(() => (yt.channel ? yt.isSubscribed(yt.channel.id) : false));
// SoundCloud profile: no subscriptions, no shorts, different counter labels.
const isScChannel = computed(() => yt.channelIsSc);

// Reset on channel/id change so a previously failed avatar can retry
// (also when the same channel is reopened or the thumbnail gets refreshed).
const avatarFailed = ref(false);
const avatarSrc = useRemoteImage(computed(() => yt.channel?.thumbnail));
const bannerSrc = useRemoteImage(computed(() => yt.channel?.bannerUrl));
watch(
  () => [yt.channel?.id, yt.channel?.thumbnail],
  () => {
    avatarFailed.value = false;
  }
);
</script>

<template>
  <div
    v-if="yt.channel"
    class="relative rounded-box overflow-hidden bg-base-100 border border-base-300"
  >
    <div
      v-if="bannerSrc"
      class="h-32 sm:h-40 w-full bg-cover bg-center relative"
      :style="{ backgroundImage: `url(${bannerSrc})` }"
    >
      <div class="absolute inset-0 bg-linear-to-b from-transparent via-bg-surface/30 to-base-100" />
    </div>
    <div v-else class="h-24 sm:h-32 w-full bg-linear-to-br from-primary/20 to-base-100" />

    <div class="relative px-4 pb-4 -mt-6 sm:-mt-8">
      <div class="flex items-end gap-4">
        <div
          class="w-20 h-20 sm:w-24 sm:h-24 rounded-box overflow-hidden border border-base-100 bg-base-100 shrink-0"
        >
          <img
            v-if="avatarSrc && !avatarFailed"
            :src="avatarSrc"
            :alt="yt.channel.title"
            class="w-full h-full object-cover"
            @error="avatarFailed = true"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-base-content/50">
            <Users :size="32" />
          </div>
        </div>
        <div class="min-w-0 flex-1 pb-1">
          <h2 class="text-lg sm:text-xl font-bold truncate">{{ yt.channel.title }}</h2>
          <p class="text-xs text-base-content/70 mt-0.5">
            <span v-if="yt.channel.subscriberCount != null">
              {{ formatNumber(yt.channel.subscriberCount) }}
              {{ $t(isScChannel ? 'youtube.followers' : 'youtube.subscribers') }}
            </span>
            <span v-if="yt.channel.videoCount != null">
              · {{ formatNumber(yt.channel.videoCount) }}
              {{ $t(isScChannel ? 'youtube.tracks' : 'youtube.videos') }}
            </span>
          </p>
        </div>
      </div>

      <p
        v-if="yt.channel.description"
        class="text-xs text-base-content/70 mt-3 line-clamp-3 max-w-2xl"
      >
        {{ yt.channel.description }}
      </p>

      <div class="flex items-center gap-2 mt-4 flex-wrap">
        <OnlineButton
          :variant="followed ? 'secondary' : 'primary'"
          size="sm"
          @click="emit('toggleFollow')"
        >
          <Bell :size="14" />
          {{ followed ? $t('youtube.unsubscribeChannel') : $t('youtube.subscribeChannel') }}
        </OnlineButton>
        <OnlineButton variant="secondary" size="sm" @click="yt.closeChannel">
          <ArrowLeft :size="14" />
          {{ $t('common.back') }}
        </OnlineButton>
        <div class="flex-1" />
        <OnlineSegmentControl
          v-model="yt.channelViewMode"
          :options="[
            { value: 'grid', label: $t('youtube.viewTiles'), icon: LayoutGrid },
            { value: 'list', label: $t('youtube.viewList'), icon: Rows3 }
          ]"
        />
      </div>
    </div>
  </div>
</template>
