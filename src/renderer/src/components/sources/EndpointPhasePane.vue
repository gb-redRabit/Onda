<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  FlaskConical,
  Loader2,
  LayoutGrid,
  Images,
  GalleryHorizontalEnd,
  MonitorPlay,
  List
} from '@lucide/vue';
import { type DraftEndpoint } from './endpointDraft';
import { buildEndpointPreview } from '@renderer/utils/endpointCard';
import EndpointPassKeys from './EndpointPassKeys.vue';
import EndpointTableConfig from './EndpointTableConfig.vue';
import EndpointFieldsSection from './EndpointFieldsSection.vue';
import EndpointAdvancedSection from './EndpointAdvancedSection.vue';

const { t } = useI18n();
const model = defineModel<DraftEndpoint>({ required: true });

const props = defineProps<{
  baseUrl: string;
  availableKeys: string[];
  /** Klucze, które ten poziom sam udostępnia (do ścieżki tabeli). */
  selfKeys?: string[];
  fieldOptions: string[];
  rowOptions: string[];
  levelOptions: Array<{ id: string; label: string }>;
  testing?: boolean;
  tableTesting?: boolean;
}>();

const emit = defineEmits<{ test: []; 'test-table': [] }>();

const isPage = computed(() => model.value.type === 'page');

// Prezentacja elementów poziomu (zapisywana w źródle) — karty/galeria/kompakt/karuzela/player.
const viewOptions = [
  { id: 'cards' as const, icon: LayoutGrid, labelKey: 'sources.viewCards' },
  { id: 'gallery' as const, icon: Images, labelKey: 'sources.viewGallery' },
  { id: 'compact' as const, icon: List, labelKey: 'sources.viewCompact' },
  { id: 'carousel' as const, icon: GalleryHorizontalEnd, labelKey: 'sources.viewCarousel' },
  { id: 'player' as const, icon: MonitorPlay, labelKey: 'sources.viewPlayer' }
];

function buildPreview(): string {
  return buildEndpointPreview(model.value, props.baseUrl);
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <div class="flex rounded-field overflow-hidden border border-base-300 bg-base-100 text-xs">
        <button
          class="px-2.5 py-1.5 font-medium transition-colors"
          :class="
            model.type === 'list'
              ? 'bg-primary text-primary-content'
              : 'text-base-content/70 hover:bg-base-content/10'
          "
          @click="model.type = 'list'"
        >
          {{ t('sources.typeList') }}
        </button>
        <button
          class="px-2.5 py-1.5 font-medium transition-colors"
          :class="
            model.type === 'page'
              ? 'bg-primary text-primary-content'
              : 'text-base-content/70 hover:bg-base-content/10'
          "
          @click="model.type = 'page'"
        >
          {{ t('sources.typePage') }}
        </button>
      </div>
      <input
        v-model="model.name"
        type="text"
        :placeholder="t('sources.endpointName')"
        class="flex-1 min-w-0 px-2.5 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>

    <div v-if="!isPage" class="flex items-center gap-2">
      <span class="text-[11px] text-base-content/50 uppercase tracking-wider">{{
        t('sources.viewLabel')
      }}</span>
      <div
        class="flex rounded-field overflow-hidden border border-base-300 bg-base-100 text-xs"
        role="group"
        :aria-label="t('sources.viewLabel')"
      >
        <button
          v-for="v in viewOptions"
          :key="v.id"
          class="fx-noise flex items-center gap-1 px-2.5 py-1.5 font-medium transition-colors"
          :class="
            model.view === v.id
              ? 'bg-primary text-primary-content'
              : 'text-base-content/70 hover:bg-base-content/10'
          "
          :title="t(v.labelKey)"
          :aria-label="t(v.labelKey)"
          :aria-pressed="model.view === v.id"
          @click="model.view = v.id"
        >
          <component :is="v.icon" :size="12" />
          <span class="hidden sm:inline">{{ t(v.labelKey) }}</span>
        </button>
      </div>
    </div>

    <EndpointFieldsSection
      v-model="model"
      :available-keys="availableKeys"
      :field-options="fieldOptions"
    />

    <EndpointPassKeys
      v-model:pass-keys="model.passKeys"
      :model-id="model.id"
      :field-options="fieldOptions"
    />

    <EndpointTableConfig
      v-if="isPage"
      v-model="model"
      :field-options="fieldOptions"
      :row-options="rowOptions"
      :available-keys="availableKeys"
      :self-keys="props.selfKeys"
      :level-options="levelOptions"
      :table-testing="tableTesting"
      @test-table="emit('test-table')"
    />

    <EndpointAdvancedSection v-model="model" />

    <div class="flex items-center gap-2 pt-0.5">
      <button
        class="fx-noise flex items-center gap-1 px-2 py-1 fx-depth rounded-field bg-base-100 border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors disabled:opacity-50"
        data-testid="endpoint-test"
        :disabled="testing"
        @click="emit('test')"
      >
        <Loader2 v-if="testing" :size="11" class="animate-spin" />
        <FlaskConical v-else :size="11" />
        {{ t('sources.test') }}
      </button>
      <span
        v-if="buildPreview()"
        class="text-[11px] font-mono text-base-content/50 truncate flex-1 min-w-0"
        >{{ buildPreview() }}</span
      >
    </div>
  </div>
</template>
