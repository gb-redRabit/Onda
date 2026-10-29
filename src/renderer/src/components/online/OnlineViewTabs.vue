<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { Bell, Link2 } from '@lucide/vue';
import OnlineBadge from './OnlineBadge.vue';

defineProps<{
  modelValue: 'discover' | 'subscriptions' | 'links';
  subscriptionCount?: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: 'discover' | 'subscriptions' | 'links'];
}>();

const { t } = useI18n();

const tabs = computed(() => [
  { key: 'discover' as const, label: t('youtube.discoverTab') },
  { key: 'subscriptions' as const, label: t('youtube.subscriptionsTab'), icon: Bell },
  { key: 'links' as const, label: t('providers.tab'), icon: Link2 }
]);

// Wzorzec WAI-ARIA tabs: strzałki/Home/End przenoszą focus (roving tabindex) i wybór.
function onTabKeydown(e: KeyboardEvent, index: number): void {
  const n = tabs.value.length;
  let next = index;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = n - 1;
  else return;
  e.preventDefault();
  emit('update:modelValue', tabs.value[next]!.key);
  const list = (e.currentTarget as HTMLElement).parentElement;
  nextTick(() => list?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus());
}
</script>

<template>
  <div
    class="ui-page-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-base-300/80 bg-base-100/60 px-5 py-2.5"
  >
    <div class="ui-segmented" role="tablist" :aria-label="t('nav.online')">
      <button
        v-for="(tab, i) in tabs"
        :key="tab.key"
        type="button"
        role="tab"
        :data-testid="'online-tab-' + tab.key"
        :aria-selected="modelValue === tab.key"
        :tabindex="modelValue === tab.key ? 0 : -1"
        class="flex items-center gap-1.5 text-xs font-medium"
        @click="emit('update:modelValue', tab.key)"
        @keydown="onTabKeydown($event, i)"
      >
        <component :is="tab.icon" v-if="tab.icon" :size="13" />
        {{ tab.label }}
        <OnlineBadge
          v-if="tab.key === 'subscriptions' && subscriptionCount"
          variant="default"
          size="sm"
        >
          {{ subscriptionCount }}
        </OnlineBadge>
      </button>
    </div>
    <div class="flex items-center gap-2">
      <slot />
    </div>
  </div>
</template>
