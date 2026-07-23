<script setup lang="ts">
import { usePromptDialog } from '@renderer/composables/usePromptDialog';

const { promptVisible, promptMessage, promptValue, showPrompt, promptConfirm, promptCancel, promptKeydown } = usePromptDialog();

defineExpose({ showPrompt });
</script>

<template>
  <Teleport to="body">
    <div v-if="promptVisible" class="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center" @click.self="promptCancel">
      <div class="bg-bg-surface border border-border-default rounded-xl p-5 min-w-[300px] shadow-2xl">
        <p class="text-sm text-fg-base mb-3 whitespace-pre-wrap">{{ promptMessage }}</p>
        <input id="prompt-input" v-model="promptValue" type="text" class="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm text-fg-base outline-none focus:ring-1 focus:ring-accent-base" @keydown="promptKeydown">
        <div class="flex justify-end gap-2 mt-4">
          <button class="px-4 py-1.5 rounded-lg text-xs text-fg-muted hover:bg-bg-hover transition-colors" @click="promptCancel">{{ $t('common.cancel') }}</button>
          <button class="px-4 py-1.5 rounded-lg text-xs bg-accent-base text-white hover:bg-accent-base/90 transition-colors" @click="promptConfirm">{{ $t('common.ok') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
