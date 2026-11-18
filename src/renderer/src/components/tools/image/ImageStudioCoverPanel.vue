<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from '@renderer/components/ui/Button.vue';
import PathInput from '@renderer/components/ui/PathInput.vue';

const coverAudioPath = defineModel<string>('coverAudioPath', { required: true });

defineProps<{ savedPath: string; status: string; ok: boolean }>();
const emit = defineEmits<{ browse: []; apply: [] }>();

const { t } = useI18n();
</script>

<template>
  <section class="space-y-2 rounded-box border border-hairline bg-base-100/70 p-3">
    <div class="text-xs font-semibold">{{ t('tools.imageStudioCover') }}</div>
    <div class="flex items-center gap-1.5">
      <PathInput
        v-model="coverAudioPath"
        :readonly="false"
        :label="t('tools.imageStudioCoverPick')"
        :placeholder="t('tools.imageStudioCoverPick')"
        @browse="emit('browse')"
      />
    </div>
    <Button
      variant="outline"
      class="w-full"
      data-testid="image-studio-cover-set"
      :disabled="!savedPath || !coverAudioPath"
      @click="emit('apply')"
    >
      {{ t('tools.imageStudioCoverSetButton') }}
    </Button>
    <p v-if="status" class="text-2xs" :class="ok ? 'text-success' : 'text-error'">
      {{ status }}
    </p>
  </section>
</template>
