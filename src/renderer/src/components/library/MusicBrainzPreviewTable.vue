<script setup lang="ts">
export interface PreviewRow {
  key: string;
  label: string;
  old: string;
  now: string;
  checked: boolean;
}

defineProps<{ rows: PreviewRow[]; applyResult: Record<string, boolean | string> | null }>();
const includeFields = defineModel<Record<string, boolean>>('includeFields', { required: true });
</script>

<template>
  <div class="border border-base-300 rounded-field overflow-hidden">
    <div class="bg-base-300/50 px-2 py-1 text-[11px] font-medium">Podgląd zmian</div>
    <div
      v-for="row in rows"
      :key="row.key"
      class="flex items-center gap-2 px-2 py-1.5 text-xs border-t border-base-300/30"
    >
      <input
        type="checkbox"
        :checked="includeFields[row.key]"
        class="checkbox checkbox-xs"
        @change="includeFields[row.key] = ($event.target as HTMLInputElement).checked"
      />
      <span class="w-14 shrink-0">{{ row.label }}</span>
      <span class="flex-1 truncate text-base-content/50 line-through">{{ row.old }}</span>
      <span class="text-primary">→</span>
      <span class="flex-1 truncate font-medium">{{ row.now }}</span>
      <span
        v-if="applyResult"
        class="text-[11px] shrink-0"
        :class="
          applyResult[row.key] === true
            ? 'text-success'
            : applyResult[row.key] === false
              ? 'text-error'
              : 'text-base-content/40'
        "
        >{{
          applyResult[row.key] === true
            ? '✓'
            : applyResult[row.key] === false
              ? '✗'
              : String(applyResult[row.key] || '')
        }}</span
      >
    </div>
  </div>
</template>
