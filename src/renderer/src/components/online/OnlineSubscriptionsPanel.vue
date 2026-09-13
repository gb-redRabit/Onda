<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Bell } from '@lucide/vue';
import OnlineEmptyState from './OnlineEmptyState.vue';
import OnlineSubscriptionCard from './OnlineSubscriptionCard.vue';
import LoaderSpinner from '@renderer/components/LoaderSpinner.vue';
import type { Subscription } from '@renderer/types/online';

defineProps<{
  subscriptions: Subscription[];
  loaded: boolean;
  checkingChannelId: string | null;
  queueingChannelId: string | null;
}>();
const emit = defineEmits<{
  openChannel: [string];
  downloadAll: [Subscription];
  checkNow: [string];
  toggleAutoDownload: [string, boolean];
  openPrefs: [Subscription];
  unfollow: [string];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="space-y-4">
    <LoaderSpinner v-if="!loaded" />

    <OnlineEmptyState
      v-else-if="subscriptions.length === 0"
      :icon="Bell"
      :title="t('youtube.noSubscriptions')"
    />

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <OnlineSubscriptionCard
        v-for="sub in subscriptions"
        :key="sub.channelId"
        :sub="sub"
        :loading-channel-id="checkingChannelId"
        :queueing-channel-id="queueingChannelId"
        @open-channel="emit('openChannel', $event)"
        @download-all="emit('downloadAll', $event)"
        @check-now="emit('checkNow', $event)"
        @toggle-auto-download="(id, enabled) => emit('toggleAutoDownload', id, enabled)"
        @open-prefs="emit('openPrefs', $event)"
        @unfollow="emit('unfollow', $event)"
      />
    </div>
  </div>
</template>
