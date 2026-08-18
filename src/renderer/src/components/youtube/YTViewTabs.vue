<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Bell } from '@lucide/vue';
import YTBadge from './YTBadge.vue';

defineProps<{
  modelValue: 'discover' | 'subscriptions';
  subscriptionCount?: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: 'discover' | 'subscriptions'];
}>();

const { t } = useI18n();

const tabs = computed(() => [
  { key: 'discover' as const, label: t('youtube.discoverTab') },
  { key: 'subscriptions' as const, label: t('youtube.subscriptionsTab'), icon: Bell }
]);
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-default">
    <div class="flex gap-1 -mb-px">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors border-b-2"
        :class="
          modelValue === tab.key
            ? 'border-accent-base text-fg-base'
            : 'border-transparent text-fg-faint hover:text-fg-muted'
        "
        @click="emit('update:modelValue', tab.key)"
      >
        <component :is="tab.icon" v-if="tab.icon" :size="14" />
        {{ tab.label }}
        <YTBadge
          v-if="tab.key === 'subscriptions' && subscriptionCount"
          variant="default"
          size="sm"
        >
          {{ subscriptionCount }}
        </YTBadge>
      </button>
    </div>
    <div class="pb-1">
      <slot />
    </div>
  </div>
</template>
