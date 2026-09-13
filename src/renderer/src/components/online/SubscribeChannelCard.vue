<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Tv2 } from '@lucide/vue';
import { useRemoteImage } from '@renderer/composables/useRemoteImage';

const props = defineProps<{
  channel: { channelId: string; channelTitle: string; channelThumbnail?: string };
  isSc: boolean;
  isEdit: boolean;
}>();

const { t } = useI18n();
const avatarFailed = ref(false);
const avatarSrc = useRemoteImage(computed(() => props.channel.channelThumbnail));

watch(
  () => props.channel.channelId,
  () => {
    avatarFailed.value = false;
  }
);
</script>

<template>
  <div class="p-5 rounded-box bg-base-100 border border-base-300">
    <div class="flex items-center gap-4">
      <div
        v-if="avatarSrc && !avatarFailed"
        class="w-16 h-16 rounded-full overflow-hidden shrink-0 bg-base-200/[var(--glass-alpha)]"
      >
        <img
          :src="avatarSrc"
          :alt="props.channel.channelTitle"
          class="w-full h-full object-cover"
          @error="avatarFailed = true"
        />
      </div>
      <div
        v-else
        class="w-16 h-16 rounded-full bg-base-200/[var(--glass-alpha)] border border-base-300 flex items-center justify-center shrink-0 text-base-content/50"
      >
        <Tv2 :size="28" />
      </div>
      <div class="min-w-0">
        <p class="text-base font-semibold text-base-content truncate">
          {{ props.channel.channelTitle }}
        </p>
        <p class="text-xs text-base-content/50">
          {{
            props.isSc
              ? t('youtube.subscribeConfigHintSc')
              : props.isEdit
                ? t('youtube.prefSectionHint')
                : t('youtube.subscribeConfigHint')
          }}
        </p>
      </div>
    </div>
  </div>
</template>
