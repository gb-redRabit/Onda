<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { X, Plus, Trash2, FlaskConical, Loader2 } from '@lucide/vue';
import { useSourcesStore } from '@renderer/stores/sources';
import { useSettingsStore } from '@renderer/stores/settings';
import type { MediaSource, SourceAuthType, SourceEndpoint } from '@renderer/types/sources';

const { t } = useI18n();

const props = defineProps<{
  source: MediaSource | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const sources = useSourcesStore();
const settings = useSettingsStore();

function randomId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

interface DraftField {
  id?: string;
  title?: string;
  subtitle?: string;
  thumbnail?: string;
  mediaUrl?: string;
  type?: string;
  duration?: string;
  sourceUrl?: string;
}

interface DraftEndpoint {
  id: string;
  name: string;
  method: 'GET' | 'POST';
  path: string;
  paramsText: string;
  pageParam: string;
  nextFromField: string;
  totalField: string;
  arrayPath: string;
  fields: DraftField;
}

function emptyEndpoint(): DraftEndpoint {
  return {
    id: randomId(),
    name: '',
    method: 'GET',
    path: '/',
    paramsText: '',
    pageParam: '',
    nextFromField: '',
    totalField: '',
    arrayPath: '',
    fields: { id: '', title: '', subtitle: '', thumbnail: '', mediaUrl: '', type: '', duration: '', sourceUrl: '' }
  };
}

function initDraft(src: MediaSource | null) {
  return reactive({
    id: src?.id || '',
    name: src?.name || '',
    baseUrl: src?.baseUrl || '',
    authType: (src?.auth?.type || 'none') as SourceAuthType,
    apiKeyId: src?.auth?.apiKeyId || '',
    headerName: src?.auth?.headerName || '',
    queryParam: src?.auth?.queryParam || '',
    endpoints: (src?.endpoints || []).map((e) => ({
      id: e.id,
      name: e.name,
      method: e.method,
      path: e.path,
      paramsText: Object.entries(e.params || {})
        .map(([k, v]) => `${k}=${v}`)
        .join('\n'),
      pageParam: e.pagination?.pageParam || '',
      nextFromField: e.pagination?.nextFromField || '',
      totalField: e.pagination?.totalField || '',
      arrayPath: e.mapping.arrayPath || '',
      fields: { ...e.mapping.fields }
    }))
  });
}

const draft = initDraft(props.source);
const saving = ref(false);
const testing = ref(false);
const errorMsg = ref('');
const testMsg = ref('');
const testOk = ref(true);

const apiKeyOptions = computed(() =>
  (settings.apiKeys?.keys || []).filter((k) => k.isActive).map((k) => ({ id: k.id, label: k.name || k.service || k.id }))
);

function parseParams(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function buildAuth() {
  if (draft.authType === 'none') return { type: 'none' as const };
  const base = { type: draft.authType, apiKeyId: draft.apiKeyId || undefined } as {
    type: SourceAuthType;
    apiKeyId?: string;
    headerName?: string;
    queryParam?: string;
  };
  if (draft.authType === 'apikey') {
    base.headerName = draft.headerName.trim() || undefined;
    base.queryParam = draft.queryParam.trim() || undefined;
  }
  return base;
}

function buildSource(): MediaSource | null {
  const name = draft.name.trim();
  const baseUrl = draft.baseUrl.trim();
  if (!name) {
    errorMsg.value = t('sources.errNameRequired');
    return null;
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    errorMsg.value = t('sources.errBaseUrl');
    return null;
  }
  const endpoints: SourceEndpoint[] = [];
  for (const e of draft.endpoints) {
    const path = e.path.trim();
    if (!path) continue;
    endpoints.push({
      id: e.id || randomId(),
      name: e.name.trim() || 'Endpoint',
      method: e.method,
      path,
      params: parseParams(e.paramsText),
      pagination:
        e.pageParam || e.nextFromField || e.totalField
          ? {
              pageParam: e.pageParam.trim() || undefined,
              nextFromField: e.nextFromField.trim() || undefined,
              totalField: e.totalField.trim() || undefined
            }
          : undefined,
      mapping: {
        arrayPath: e.arrayPath.trim() || undefined,
        fields: {
          id: e.fields.id?.trim() || undefined,
          title: e.fields.title?.trim() || undefined,
          subtitle: e.fields.subtitle?.trim() || undefined,
          thumbnail: e.fields.thumbnail?.trim() || undefined,
          mediaUrl: e.fields.mediaUrl?.trim() || undefined,
          type: e.fields.type?.trim() || undefined,
          duration: e.fields.duration?.trim() || undefined,
          sourceUrl: e.fields.sourceUrl?.trim() || undefined
        }
      }
    });
  }
  if (!endpoints.length) {
    errorMsg.value = 'errEndpointRequired';
    return null;
  }
  return {
    id: draft.id || randomId(),
    name,
    baseUrl,
    auth: buildAuth(),
    endpoints,
    createdAt: props.source?.createdAt ?? Date.now()
  };
}

async function onSave() {
  errorMsg.value = '';
  const built = buildSource();
  if (!built) return;
  saving.value = true;
  try {
    const res = await sources.saveSource(built);
    if (res.ok) {
      emit('saved');
      emit('close');
    } else {
      errorMsg.value = res.error || 'Save failed';
    }
  } finally {
    saving.value = false;
  }
}

async function onTest(idx: number) {
  errorMsg.value = '';
  testMsg.value = '';
  const built = buildSource();
  if (!built) return;
  const endpoint = built.endpoints[idx];
  if (!endpoint) return;
  testing.value = true;
  try {
    const res = await sources.testSource(built, endpoint);
    testMsg.value = res.success
      ? `OK — ${built.endpoints.length} endpoint(s), sample mapped`
      : `FAIL: ${res.error || 'unknown'}`;
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" @click.self="emit('close')">
      <div class="w-full max-w-2xl max-h-full flex flex-col rounded-2xl bg-bg-surface border border-border-default shadow-2xl overflow-hidden">
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border-default">
          <h2 class="text-sm font-medium flex-1">
            {{ props.source ? $t('sources.editSource') : $t('sources.addSource') }}
          </h2>
          <button
            class="p-1.5 rounded-lg text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
          <div class="grid grid-cols-1 gap-3">
            <div>
              <label class="block text-[11px] font-medium text-fg-faint uppercase tracking-wider mb-1">
                {{ $t('sources.name') }}
              </label>
              <input
                v-model="draft.name"
                type="text"
                :placeholder="$t('sources.namePlaceholder')"
                class="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm focus:outline-none focus:ring-1 focus:ring-accent-base"
              />
            </div>
            <div>
              <label class="block text-[11px] font-medium text-fg-faint uppercase tracking-wider mb-1">
                {{ $t('sources.baseUrl') }}
              </label>
              <input
                v-model="draft.baseUrl"
                type="text"
                placeholder="https://api.example.com"
                class="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
              />
            </div>
          </div>

          <div class="space-y-2">
            <label class="block text-[11px] font-medium text-fg-faint uppercase tracking-wider">
              {{ $t('sources.auth') }}
            </label>
            <div class="flex flex-wrap gap-2">
              <select
                v-model="draft.authType"
                class="px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm focus:outline-none focus:ring-1 focus:ring-accent-base"
              >
                <option value="none">{{ $t('sources.authNone') }}</option>
                <option value="apikey">{{ $t('sources.authApiKey') }}</option>
                <option value="bearer">{{ $t('sources.authBearer') }}</option>
              </select>
              <template v-if="draft.authType !== 'none'">
                <select
                  v-model="draft.apiKeyId"
                  class="px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm focus:outline-none focus:ring-1 focus:ring-accent-base"
                >
                  <option value="">{{ $t('sources.chooseKey') }}</option>
                  <option v-for="k in apiKeyOptions" :key="k.id" :value="k.id">{{ k.label }}</option>
                </select>
                <template v-if="draft.authType === 'apikey'">
                  <input
                    v-model="draft.headerName"
                    type="text"
                    :placeholder="$t('sources.headerName')"
                    class="px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                  />
                  <input
                    v-model="draft.queryParam"
                    type="text"
                    :placeholder="$t('sources.queryParam')"
                    class="px-3 py-2 rounded-lg bg-bg-elevated border border-border-default text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                  />
                </template>
              </template>
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-[11px] font-medium text-fg-faint uppercase tracking-wider">
                {{ $t('sources.endpoints') }}
              </label>
              <button
                class="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent-base/10 text-accent-base text-xs font-medium hover:bg-accent-base/20 transition-colors"
                @click="draft.endpoints.push(emptyEndpoint())"
              >
                <Plus :size="12" />
                {{ $t('sources.addEndpoint') }}
              </button>
            </div>

            <div
              v-for="(ep, idx) in draft.endpoints"
              :key="ep.id"
              class="rounded-xl border border-border-default bg-bg-elevated/50 p-3 space-y-2"
            >
              <div class="flex items-center gap-2">
                <input
                  v-model="ep.name"
                  type="text"
                  :placeholder="$t('sources.endpointName')"
                  class="flex-1 px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-sm focus:outline-none focus:ring-1 focus:ring-accent-base"
                />
                <select
                  v-model="ep.method"
                  class="px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
                <button
                  class="p-1.5 rounded-lg text-fg-faint hover:text-red-base transition-colors"
                  :aria-label="$t('common.delete')"
                  @click="draft.endpoints.splice(idx, 1)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
              <input
                v-model="ep.path"
                type="text"
                placeholder="/top/anime"
                class="w-full px-2.5 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
              />
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">
                    {{ $t('sources.arrayPath') }}
                  </label>
                  <input
                    v-model="ep.arrayPath"
                    type="text"
                    placeholder="data"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">
                    {{ $t('sources.params') }}
                  </label>
                  <input
                    v-model="ep.paramsText"
                    type="text"
                    placeholder="rating=safe"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                  />
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">Page param</label>
                  <input
                    v-model="ep.pageParam"
                    type="text"
                    placeholder="page"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">Next field</label>
                  <input
                    v-model="ep.nextFromField"
                    type="text"
                    placeholder="pagination.next_token"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">Has more field</label>
                  <input
                    v-model="ep.totalField"
                    type="text"
                    placeholder="pagination.has_next"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">title</label>
                  <input
v-model="ep.fields.title" type="text" placeholder="title"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base" />
                </div>
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">subtitle</label>
                  <input
v-model="ep.fields.subtitle" type="text" placeholder="artist"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base" />
                </div>
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">thumbnail</label>
                  <input
v-model="ep.fields.thumbnail" type="text" placeholder="images.jpg.image_url"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base" />
                </div>
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">media URL</label>
                  <input
v-model="ep.fields.mediaUrl" type="text" placeholder="file_url"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base" />
                </div>
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">type</label>
                  <input
v-model="ep.fields.type" type="text" placeholder="image | video | audio | file"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base" />
                </div>
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">duration</label>
                  <input
v-model="ep.fields.duration" type="text" placeholder="duration"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base" />
                </div>
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">id</label>
                  <input
v-model="ep.fields.id" type="text" placeholder="mal_id"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base" />
                </div>
                <div>
                  <label class="block text-[10px] text-fg-faint uppercase tracking-wider mb-0.5">source URL</label>
                  <input
v-model="ep.fields.sourceUrl" type="text" placeholder="url"
                    class="w-full px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent-base" />
                </div>
              </div>

              <div class="flex items-center gap-2 pt-1">
                <button
                  class="flex items-center gap-1 px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
                  :disabled="testing"
                  @click="onTest(idx)"
                >
                  <Loader2 v-if="testing" :size="11" class="animate-spin" />
                  <FlaskConical v-else :size="11" />
                  {{ $t('sources.test') }}
                </button>
              </div>
            </div>
          </div>

          <p v-if="testMsg" class="text-xs" :class="testMsg.startsWith('OK') ? 'text-green-base' : 'text-red-base'">
            {{ testMsg }}
          </p>
          <p v-if="errorMsg" class="text-xs text-red-base">{{ errorMsg }}</p>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-fg-muted hover:bg-bg-hover transition-colors"
            @click="emit('close')"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            class="px-3 py-1.5 rounded-lg bg-accent-base text-white text-sm font-medium hover:bg-accent-strong transition-colors flex items-center gap-1.5"
            :disabled="saving"
            @click="onSave"
          >
            <Loader2 v-if="saving" :size="14" class="animate-spin" />
            {{ $t('common.save') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>