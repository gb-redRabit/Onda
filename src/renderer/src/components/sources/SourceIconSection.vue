<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Globe, Link2, Trash2 } from '@lucide/vue';

const emit = defineEmits<{ error: [string] }>();
const icon = defineModel<string>('icon', { required: true });

const iconUrl = ref('');
const iconValid = computed(
  () => !!icon.value && (/^data:image\//i.test(icon.value) || /^https?:\/\//i.test(icon.value))
);

const { t } = useI18n();

async function pickIconFile() {
  const res = (await window.api.invoke('sources:pickIcon')) as {
    success: boolean;
    dataUrl?: string;
    error?: string;
  };
  if (res.success && res.dataUrl) {
    icon.value = res.dataUrl;
    iconUrl.value = '';
  } else if (res.error) {
    emit('error', res.error);
  }
}

function applyIconUrl() {
  const url = iconUrl.value.trim();
  if (!/^https?:\/\//i.test(url)) {
    emit('error', t('sources.iconUrlInvalid'));
    return;
  }
  icon.value = url;
}

function clearIcon() {
  icon.value = '';
  iconUrl.value = '';
}
</script>

<template>
  <div class="space-y-2 rounded-box border border-neutral-content/20 bg-neutral p-3">
    <label class="block text-[11px] font-medium text-base-content/50 uppercase tracking-wider">
      {{ t('sources.iconSection') }}
    </label>
    <div class="flex items-start gap-3">
      <div
        class="w-12 h-12 shrink-0 rounded-field bg-base-100 border border-base-300 flex items-center justify-center overflow-hidden"
      >
        <img v-if="iconValid" :src="icon" class="w-full h-full object-cover" />
        <Globe v-else :size="20" class="text-base-content/50" />
      </div>
      <div class="flex-1 min-w-0 space-y-2">
        <div class="flex items-center gap-2">
          <button
            class="fx-noise shrink-0 px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
            @click="pickIconFile"
          >
            {{ t('sources.iconFromPc') }}
          </button>
          <input
            v-model="iconUrl"
            type="text"
            :placeholder="t('sources.iconUrlPlaceholder')"
            class="flex-1 min-w-0 px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            @keyup.enter="applyIconUrl"
          />
          <button
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors"
            :title="t('sources.iconApplyUrl')"
            @click="applyIconUrl"
          >
            <Link2 :size="14" />
          </button>
          <button
            v-if="icon"
            class="fx-noise shrink-0 p-2 fx-depth rounded-field text-base-content/70 hover:bg-error/10 hover:text-error transition-colors"
            :title="t('sources.iconClear')"
            @click="clearIcon"
          >
            <Trash2 :size="14" />
          </button>
        </div>
        <p class="text-[10px] text-base-content/50">{{ t('sources.iconHint') }}</p>
      </div>
    </div>
  </div>
</template>
