<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import { CornerDownRight, CornerDownLeft, CornerUpRight, CornerUpLeft } from '@lucide/vue';

const settings = useSettingsStore();

const positions = [
  { id: 'top-left' as const, labelKey: 'settings.topLeft', row: 0, col: 0 },
  { id: 'top-right' as const, labelKey: 'settings.topRight', row: 0, col: 1 },
  { id: 'bottom-left' as const, labelKey: 'settings.bottomLeft', row: 1, col: 0 },
  { id: 'bottom-right' as const, labelKey: 'settings.bottomRight', row: 1, col: 1 }
];

const grid: (typeof positions)[number][] = [
  positions[0], positions[1],
  positions[2], positions[3]
];
</script>

<template>
  <div class="max-w-md space-y-6">
    <div>
      <h2 class="text-sm font-bold mb-1">{{ $t('settings.toastTitle') }}</h2>
      <p class="text-xs text-fg-faint">
        {{ $t('settings.toastDesc') }}
      </p>
    </div>

    <div>
      <label class="text-xs font-medium text-fg-muted block mb-2">{{ $t('settings.toastPosition') }}</label>
      <div class="w-48  aspect-square rounded-2xl bg-bg-elevated border-2 border-border-default p-2 relative select-none">
        <div class="grid grid-cols-2 grid-rows-2 gap-2 w-full h-full">
          <button
            v-for="p in grid"
            :key="p.id"
            class="rounded-xl text-[11px] font-medium transition-all border-2 flex flex-col items-center justify-center gap-1"
            :class="settings.toast.position === p.id
              ? 'border-accent-base bg-accent-ghost text-accent-base shadow-sm shadow-accent-base/20'
              : 'border-transparent text-fg-faint hover:bg-bg-hover hover:text-fg-muted'"
            @click="settings.updateToast({ position: p.id })"
          >
            <component :is="p.row === 0 ? CornerUpRight : CornerDownRight" :size="16" v-if="p.col === 1" />
            <component :is="p.row === 0 ? CornerUpLeft : CornerDownLeft" :size="16" v-if="p.col === 0" />
            <span>{{ $t(p.labelKey) }}</span>
          </button>
        </div>
        <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div class="w-5 h-5 rounded border-2 border-dashed border-fg-faint/20" />
        </div>
      </div>
      <p class="text-[11px] text-fg-faint mt-2">
        {{ $t('settings.selected') }} <span class="text-fg-base font-medium">{{ $t(positions.find(p => p.id === settings.toast.position)?.labelKey ?? '') }}</span>
      </p>
    </div>

    <div class="space-y-2">
      <label class="text-xs font-medium text-fg-muted block">{{ $t('settings.toastTypes') }}</label>
      <label class="flex items-center gap-3 px-3 py-2 rounded-xl bg-bg-elevated cursor-pointer">
        <input
          type="checkbox"
          class="w-4 h-4 rounded accent-accent-base"
          :checked="settings.toast.showSuccess"
          @change="settings.updateToast({ showSuccess: !settings.toast.showSuccess })"
        />
        <span class="text-sm text-fg-base">{{ $t('settings.toastSuccess') }}</span>
        <span class="ml-auto text-[11px] text-fg-faint">{{ $t('settings.toastSuccessHint') }}</span>
      </label>
      <label class="flex items-center gap-3 px-3 py-2 rounded-xl bg-bg-elevated cursor-pointer">
        <input
          type="checkbox"
          class="w-4 h-4 rounded accent-accent-base"
          :checked="settings.toast.showInfo"
          @change="settings.updateToast({ showInfo: !settings.toast.showInfo })"
        />
        <span class="text-sm text-fg-base">{{ $t('settings.toastInfo') }}</span>
        <span class="ml-auto text-[11px] text-fg-faint">{{ $t('settings.toastInfoHint') }}</span>
      </label>
      <label class="flex items-center gap-3 px-3 py-2 rounded-xl bg-bg-elevated cursor-pointer">
        <input
          type="checkbox"
          class="w-4 h-4 rounded accent-accent-base"
          :checked="settings.toast.showWarning"
          @change="settings.updateToast({ showWarning: !settings.toast.showWarning })"
        />
        <span class="text-sm text-fg-base">{{ $t('settings.toastWarn') }}</span>
        <span class="ml-auto text-[11px] text-fg-faint">{{ $t('settings.toastWarnHint') }}</span>
      </label>
      <div class="flex items-center gap-3 px-3 py-2 rounded-xl bg-bg-elevated opacity-60">
        <input type="checkbox" class="w-4 h-4 rounded accent-accent-base" checked disabled />
        <span class="text-sm text-fg-base">{{ $t('settings.toastErrors') }}</span>
        <span class="ml-auto text-[11px] text-fg-faint">{{ $t('settings.toastErrorsHint') }}</span>
      </div>
    </div>
  </div>
</template>
