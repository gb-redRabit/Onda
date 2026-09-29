<script setup lang="ts">
import { computed, type Component } from 'vue';
import { RotateCcw } from '@lucide/vue';

const props = defineProps<{
  sections: readonly { id: string; labelKey: string; icon: Component }[];
  tabs: readonly { id: string; labelKey: string; icon: Component; section: string }[];
  activeSection: string | null;
  activeTab: string | null;
}>();

const emit = defineEmits<{
  (e: 'select-section', id: string): void;
  (e: 'select-tab', id: string): void;
  (e: 'reset'): void;
}>();

function tabsOf(sectionId: string) {
  return props.tabs.filter((tab) => tab.section === sectionId);
}

// In the collapsed (narrow) variant only section icons are visible, so highlight
// the section that owns the open tab.
const activeSectionId = computed(
  () => props.activeSection ?? props.tabs.find((tab) => tab.id === props.activeTab)?.section ?? null
);
</script>

<template>
  <nav
    class="shrink-0 flex flex-col overflow-y-auto border-r border-base-300/60 bg-base-200/30 w-12 lg:w-56 px-1 lg:px-2 py-3"
  >
    <template v-for="section in sections" :key="section.id">
      <button
        class="flex items-center gap-2 px-2 h-8 rounded-field text-[11px] font-semibold uppercase tracking-wider transition-colors shrink-0"
        :class="
          activeSectionId === section.id
            ? 'text-primary'
            : 'text-base-content/40 hover:text-base-content hover:bg-base-content/5'
        "
        :title="$t(section.labelKey)"
        :aria-label="$t(section.labelKey)"
        :aria-current="activeSectionId === section.id ? 'location' : undefined"
        :data-testid="`settings-section-${section.id}`"
        @click="emit('select-section', section.id)"
      >
        <component :is="section.icon" :size="15" class="shrink-0" />
        <span class="hidden lg:inline truncate">{{ $t(section.labelKey) }}</span>
      </button>
      <div class="hidden lg:flex flex-col gap-0.5 mb-1">
        <button
          v-for="tab in tabsOf(section.id)"
          :key="tab.id"
          class="flex items-center gap-2 pl-7 pr-2 h-7 rounded-field text-[13px] text-left transition-colors"
          :class="
            activeTab === tab.id
              ? 'bg-primary/15 text-primary font-medium'
              : 'text-base-content/65 hover:bg-base-content/5 hover:text-base-content'
          "
          :aria-current="activeTab === tab.id ? 'page' : undefined"
          :data-testid="`settings-tab-${tab.id}`"
          @click="emit('select-tab', tab.id)"
        >
          <span class="truncate">{{ $t(tab.labelKey) }}</span>
        </button>
      </div>
    </template>

    <div class="mt-auto pt-3 border-t border-base-300/50">
      <button
        class="flex items-center gap-2 px-2 h-8 w-full rounded-field text-[12px] text-base-content/50 hover:text-error hover:bg-error/10 transition-colors"
        :title="$t('settings.reset')"
        data-testid="settings-reset"
        @click="emit('reset')"
      >
        <RotateCcw :size="14" class="shrink-0" />
        <span class="hidden lg:inline">{{ $t('settings.reset') }}</span>
      </button>
    </div>
  </nav>
</template>
