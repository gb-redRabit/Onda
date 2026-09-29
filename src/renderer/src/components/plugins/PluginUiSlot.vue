<script setup lang="ts">
import { computed } from 'vue';
import { usePluginsStore } from '@renderer/stores/plugins';
import type { PluginSlotItem, PluginUiSlotId } from '@shared/plugin-ui-slots';

const props = withDefaults(defineProps<{ slotId?: PluginUiSlotId; visible?: boolean }>(), {
  slotId: 'audio-view',
  visible: true
});

const plugins = usePluginsStore();

/**
 * Host renderuje treść wtyczki: wyłącznie tekst z payloadu, przez
 * interpolację Vue (bez `v-html`), z limitami z `plugin-ui-slots.ts`.
 * Kolejność = kolejność pluginów na liście; w jednym slocie kilka wtyczek
 * dzieli pionową kolumnę.
 */
const groups = computed(() =>
  props.visible && props.slotId
    ? Object.entries(plugins.slots)
        .map(([pluginId, bySlot]) => ({
          pluginId,
          items: (bySlot as Record<string, PluginSlotItem[]>)[props.slotId] ?? []
        }))
        .filter((group) => group.items.length > 0)
    : []
);
</script>

<template>
  <div
    v-if="groups.length"
    class="absolute bottom-4 left-4 z-40 flex flex-col gap-3 pointer-events-none max-w-72"
    :data-testid="`plugin-slot-${props.slotId}`"
  >
    <div
      v-for="group in groups"
      :key="group.pluginId"
      class="flex flex-col gap-0.5 fx-depth rounded-field bg-base-100/(--glass-alpha) px-2.5 py-1.5"
    >
      <span
        v-for="(item, index) in group.items"
        :key="`${group.pluginId}-${index}`"
        class="flex items-baseline gap-2 text-[11px] leading-tight"
        :data-testid="`plugin-slot-item-${group.pluginId}`"
      >
        <span v-if="item.label" class="shrink-0 text-base-content/45">{{ item.label }}</span>
        <span class="truncate text-base-content/85">{{ item.value }}</span>
      </span>
    </div>
  </div>
</template>
