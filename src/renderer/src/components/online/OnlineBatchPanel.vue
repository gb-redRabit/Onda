<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Download } from '@lucide/vue';
import OnlineBadge from './OnlineBadge.vue';
import OnlineButton from './OnlineButton.vue';

defineProps<{
  open: boolean;
  entries: Array<{ url: string; kind: string }>;
  skippedCount: number;
  hasSc: boolean;
  profiles: Array<{ id: string; name: string }>;
  busy: boolean;
  result: string;
}>();
const emit = defineEmits<{ importFile: []; submit: [] }>();

const text = defineModel<string>('text', { required: true });
const profileId = defineModel<string>('profileId', { required: true });

const { t } = useI18n();
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 -translate-y-1"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-1"
  >
    <div v-if="open" class="mt-3 p-3 rounded-box bg-base-100 border border-base-300">
      <textarea
        v-model="text"
        :placeholder="t('youtube.batchPlaceholder')"
        rows="4"
        class="w-full px-3 py-2.5 fx-depth rounded-field bg-base-100 border border-base-300 text-sm text-base-content placeholder:text-base-content/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y"
      />
      <div class="flex items-center gap-2 mt-3 flex-wrap">
        <span class="text-xs text-base-content/50">
          {{ t('youtube.batchDetected', { count: entries.length }) }}
        </span>
        <span v-if="skippedCount > 0" class="text-xs text-base-content/70">
          {{ t('youtube.batchSkipped', { count: skippedCount }) }}
        </span>
        <select
          v-if="profiles.length && !hasSc"
          v-model="profileId"
          class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content focus:border-primary focus:outline-none"
        >
          <option value="">{{ t('youtube.profileNone') }}</option>
          <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <span v-else-if="profiles.length && hasSc" class="text-[10px] text-base-content/50">
          {{ t('youtube.batchProfilesScHint') }}
        </span>
        <div class="flex-1" />
        <OnlineButton variant="secondary" size="sm" @click="emit('importFile')">
          {{ t('youtube.batchImport') }}
        </OnlineButton>
        <OnlineButton
          variant="primary"
          size="sm"
          :disabled="!entries.length || busy"
          @click="emit('submit')"
        >
          <Download :size="12" />
          {{ t('youtube.batchAdd') }}
        </OnlineButton>
      </div>
      <p v-if="result" class="text-xs text-success mt-2">{{ result }}</p>
      <ul v-if="entries.length" class="mt-2 max-h-40 overflow-auto space-y-1">
        <li
          v-for="e in entries"
          :key="e.url"
          class="flex items-center gap-2 text-xs text-base-content/70"
        >
          <OnlineBadge
            :variant="e.kind === 'video' ? 'accent' : e.kind === 'playlist' ? 'amber' : 'green'"
          >
            {{
              t(
                e.kind === 'video'
                  ? 'youtube.kindVideo'
                  : e.kind === 'playlist'
                    ? 'youtube.kindPlaylist'
                    : 'youtube.kindChannel'
              )
            }}
          </OnlineBadge>
          <span class="truncate">{{ e.url }}</span>
        </li>
      </ul>
    </div>
  </Transition>
</template>
