<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Sparkles, Trash2, X } from '@lucide/vue';
import ModalShell from '@renderer/components/ui/ModalShell.vue';
import { useLibraryStore } from '@renderer/stores/library';
import { usePlayerStore } from '@renderer/stores/player';
import type {
  SmartPlaylist,
  SmartPlaylistField,
  SmartPlaylistOperator,
  SmartPlaylistRule,
  SmartPlaylistSort,
  SmartPlaylistValue
} from '@shared/types/smart-playlist';
import {
  SMART_FIELD_DEFS,
  SMART_OPERATOR_DEFS,
  SMART_PLAYLIST_TEMPLATES,
  SMART_SORT_KEYS,
  SMART_SORT_LABEL_KEYS,
  countSmartPlaylist,
  fieldDef,
  type SmartPlaylistTemplate
} from '@renderer/utils/smartPlaylists';

const props = defineProps<{ playlist?: SmartPlaylist | null }>();
const emit = defineEmits<{
  save: [payload: Pick<SmartPlaylist, 'name' | 'match' | 'rules' | 'sort' | 'sortDir' | 'limit'>];
  cancel: [];
}>();

const { t } = useI18n();
const library = useLibraryStore();
const player = usePlayerStore();
void player.ensureFavorites();

function defaultRule(): SmartPlaylistRule {
  const def = SMART_FIELD_DEFS.find((d) => d.field === 'genre') ?? SMART_FIELD_DEFS[0];
  return { field: def.field, operator: def.operators[0], value: def.defaultValue };
}

const name = ref(props.playlist?.name ?? '');
const match = ref<'all' | 'any'>(props.playlist?.match ?? 'all');
const rules = ref<SmartPlaylistRule[]>(
  props.playlist?.rules.map((rule) => ({ ...rule })) ?? [defaultRule()]
);
const sort = ref<SmartPlaylistSort | ''>(props.playlist?.sort ?? '');
const sortDir = ref<'asc' | 'desc'>(props.playlist?.sortDir ?? 'desc');
const limit = ref(props.playlist?.limit ?? 0);

const title = computed(() =>
  props.playlist ? t('library.smartPlaylists.editTitle') : t('library.smartPlaylists.createTitle')
);

const preview = computed(() =>
  countSmartPlaylist(
    {
      id: props.playlist?.id ?? 'preview',
      name: name.value,
      match: match.value,
      rules: rules.value,
      sort: sort.value || undefined,
      sortDir: sortDir.value,
      limit: limit.value,
      createdAt: 0,
      updatedAt: 0
    },
    library.tracks,
    { favorites: new Set(player.favorites), now: Date.now() }
  )
);

const canSave = computed(() => name.value.trim().length > 0 && rules.value.length > 0);

function setField(index: number, field: SmartPlaylistField): void {
  const def = fieldDef(field);
  if (!def) return;
  rules.value[index] = {
    field,
    operator: def.operators[0],
    value: def.defaultValue
  };
}

function setOperator(index: number, operator: SmartPlaylistOperator): void {
  const rule = rules.value[index];
  if (!rule) return;
  let value = rule.value;
  if (!SMART_OPERATOR_DEFS[operator].needsValue) {
    value = operator === 'isFalse' ? false : true;
  } else if (operator === 'between') {
    value = Array.isArray(value) ? value : [0, 0];
  } else if (Array.isArray(value)) {
    value = 0;
  }
  rules.value[index] = { ...rule, operator, value };
}

function setValue(index: number, value: SmartPlaylistValue): void {
  const rule = rules.value[index];
  if (rule) rules.value[index] = { ...rule, value };
}

function setNumberValue(index: number, raw: string, part?: 0 | 1): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  const rule = rules.value[index];
  if (!rule) return;
  if (part !== undefined && Array.isArray(rule.value)) {
    const next: [number, number] = [rule.value[0], rule.value[1]];
    next[part] = value;
    setValue(index, next);
    return;
  }
  setValue(index, value);
}

function valueKind(rule: SmartPlaylistRule): 'text' | 'number' | 'between' | 'days' | 'none' {
  const def = fieldDef(rule.field);
  if (!def) return 'none';
  if (!SMART_OPERATOR_DEFS[rule.operator]?.needsValue) return 'none';
  if (rule.operator === 'between') return 'between';
  if (def.type === 'text') return 'text';
  if (def.type === 'date') return 'days';
  return 'number';
}

function addRule(): void {
  rules.value.push(defaultRule());
}

function removeRule(index: number): void {
  rules.value.splice(index, 1);
}

function applyTemplate(template: SmartPlaylistTemplate): void {
  const built = template.build();
  match.value = built.match;
  rules.value = built.rules.map((rule) => ({ ...rule }));
  sort.value = built.sort ?? '';
  sortDir.value = built.sortDir ?? 'desc';
  limit.value = built.limit ?? 0;
  if (!name.value.trim()) name.value = t(template.labelKey);
}

function save(): void {
  if (!canSave.value) return;
  emit('save', {
    name: name.value.trim(),
    match: match.value,
    rules: rules.value.map((rule) => ({ ...rule })),
    sort: sort.value || undefined,
    sortDir: sortDir.value,
    limit: limit.value
  });
}

function close(): void {
  emit('cancel');
}
</script>

<template>
  <ModalShell
    labelled-by="smart-playlist-dialog-title"
    backdrop="dim-blur"
    panel-class="w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
    @close="close"
    @escape="close"
  >
    <div class="flex items-center gap-3 px-5 py-4 border-b border-base-300 shrink-0">
      <Sparkles :size="16" class="text-primary-text shrink-0" />
      <h3 id="smart-playlist-dialog-title" class="flex-1 text-sm font-semibold">{{ title }}</h3>
      <button
        class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
        :aria-label="$t('common.close')"
        @click="close"
      >
        <X :size="16" />
      </button>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-3">
        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('library.smartPlaylists.name') }}
          </span>
          <input
            v-model="name"
            data-testid="smart-playlist-name"
            type="text"
            :placeholder="t('library.smartPlaylists.namePlaceholder')"
            class="mt-1 w-full px-2.5 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('library.smartPlaylists.match') }}
          </span>
          <select
            v-model="match"
            class="mt-1 w-full px-2.5 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">{{ t('library.smartPlaylists.matchAll') }}</option>
            <option value="any">{{ t('library.smartPlaylists.matchAny') }}</option>
          </select>
        </label>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[11px] font-medium text-base-content/60 mr-1">
          {{ t('library.smartPlaylists.templatesLabel') }}
        </span>
        <button
          v-for="template in SMART_PLAYLIST_TEMPLATES"
          :key="template.key"
          class="fx-noise px-2 py-1 fx-depth rounded-field border border-base-300 text-[11px] text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
          @click="applyTemplate(template)"
        >
          {{ t(template.labelKey) }}
        </button>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('library.smartPlaylists.rules') }}
          </span>
          <button
            data-testid="smart-playlist-add-rule"
            class="fx-noise flex items-center gap-1 px-2 py-1 fx-depth rounded-field border border-base-300 text-[11px] text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
            @click="addRule"
          >
            <Plus :size="11" />
            {{ t('library.smartPlaylists.addRule') }}
          </button>
        </div>

        <div
          v-for="(rule, index) in rules"
          :key="index"
          data-testid="smart-rule-row"
          class="grid grid-cols-1 sm:grid-cols-[11rem_9rem_1fr_auto] gap-2 items-center"
        >
          <select
            :value="rule.field"
            class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            :aria-label="t('library.smartPlaylists.field')"
            @change="
              setField(index, ($event.target as HTMLSelectElement).value as SmartPlaylistField)
            "
          >
            <option v-for="def in SMART_FIELD_DEFS" :key="def.field" :value="def.field">
              {{ t(def.labelKey) }}
            </option>
          </select>

          <select
            :value="rule.operator"
            class="px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            :aria-label="t('library.smartPlaylists.operator')"
            @change="
              setOperator(
                index,
                ($event.target as HTMLSelectElement).value as SmartPlaylistOperator
              )
            "
          >
            <option v-for="op in fieldDef(rule.field)?.operators ?? []" :key="op" :value="op">
              {{ t(SMART_OPERATOR_DEFS[op].labelKey) }}
            </option>
          </select>

          <div class="min-w-0">
            <input
              v-if="valueKind(rule) === 'text'"
              :value="String(rule.value ?? '')"
              type="text"
              class="w-full px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              :aria-label="t('library.smartPlaylists.value')"
              @input="setValue(index, ($event.target as HTMLInputElement).value)"
            />
            <div
              v-else-if="valueKind(rule) === 'number' || valueKind(rule) === 'days'"
              class="flex items-center gap-1"
            >
              <input
                :value="Number(rule.value) || 0"
                type="number"
                min="0"
                class="w-full min-w-0 px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                :aria-label="t('library.smartPlaylists.value')"
                @input="setNumberValue(index, ($event.target as HTMLInputElement).value)"
              />
              <span
                v-if="valueKind(rule) === 'days'"
                class="shrink-0 text-[11px] text-base-content/40"
              >
                {{ t('library.smartPlaylists.days') }}
              </span>
            </div>
            <div v-else-if="valueKind(rule) === 'between'" class="flex items-center gap-1">
              <input
                :value="Array.isArray(rule.value) ? rule.value[0] : 0"
                type="number"
                class="w-full min-w-0 px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                :aria-label="t('library.smartPlaylists.value')"
                @input="setNumberValue(index, ($event.target as HTMLInputElement).value, 0)"
              />
              <span class="text-[11px] text-base-content/40">–</span>
              <input
                :value="Array.isArray(rule.value) ? rule.value[1] : 0"
                type="number"
                class="w-full min-w-0 px-2 py-1.5 fx-depth rounded-field bg-base-100 border border-base-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                :aria-label="t('library.smartPlaylists.value')"
                @input="setNumberValue(index, ($event.target as HTMLInputElement).value, 1)"
              />
            </div>
            <span v-else class="text-[11px] text-base-content/40">—</span>
          </div>

          <button
            class="fx-noise p-1.5 fx-depth rounded-field text-base-content/40 hover:text-error hover:bg-error/10 transition-colors"
            :title="t('library.smartPlaylists.removeRule')"
            :aria-label="t('library.smartPlaylists.removeRule')"
            @click="removeRule(index)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('library.smartPlaylists.sort') }}
          </span>
          <select
            v-model="sort"
            class="mt-1 w-full px-2.5 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{{ t('library.smartPlaylists.sortNone') }}</option>
            <option v-for="key in SMART_SORT_KEYS" :key="key" :value="key">
              {{ t(SMART_SORT_LABEL_KEYS[key]) }}
            </option>
          </select>
        </label>
        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('library.smartPlaylists.sortDir') }}
          </span>
          <select
            v-model="sortDir"
            class="mt-1 w-full px-2.5 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="asc">{{ t('library.smartPlaylists.asc') }}</option>
            <option value="desc">{{ t('library.smartPlaylists.desc') }}</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('library.smartPlaylists.limit') }}
          </span>
          <select
            v-model.number="limit"
            class="mt-1 w-full px-2.5 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option :value="0">{{ t('library.smartPlaylists.limitAll') }}</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="250">250</option>
            <option :value="500">500</option>
          </select>
        </label>
      </div>
    </div>

    <div
      class="flex items-center justify-between gap-2 px-5 py-3 border-t border-base-300 shrink-0"
    >
      <span class="text-xs text-base-content/60" data-testid="smart-playlist-preview">
        {{ t('library.smartPlaylists.preview', { count: preview }) }}
      </span>
      <div class="flex items-center gap-2">
        <button
          class="fx-noise px-4 py-2 fx-depth rounded-field border border-base-300 text-sm text-base-content/70 hover:bg-base-content/10 transition-colors"
          @click="close"
        >
          {{ $t('common.cancel') }}
        </button>
        <button
          data-testid="smart-playlist-save"
          class="fx-noise px-4 py-2 fx-depth rounded-field bg-primary hover:bg-primary/90 text-primary-content text-sm font-medium transition-colors disabled:opacity-40"
          :disabled="!canSave"
          @click="save"
        >
          {{ $t('common.save') }}
        </button>
      </div>
    </div>
  </ModalShell>
</template>
