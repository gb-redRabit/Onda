<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RefreshCw, ExternalLink, X, Loader2 } from '@lucide/vue';

// Powłoka okna podglądu: pasek narzędzi (odśwież, otwórz na zewnątrz, zamknij) +
// osadzony `<webview>` w izolowanej partycji podglądu. Spoof nagłówków i UA robi
// proces główny (sesja `persist:onda-preview`).
type WebviewEl = HTMLElement & { reload(): void };

const pl = (navigator.language || 'en').toLowerCase().startsWith('pl');
const L = pl
  ? { reload: 'Odśwież', openExternal: 'Otwórz w przeglądarce', close: 'Zamknij' }
  : { reload: 'Reload', openExternal: 'Open in browser', close: 'Close' };

const container = ref<HTMLElement | null>(null);
const loading = ref(true);
const targetUrl = ref('');
let webview: WebviewEl | null = null;

function parseTarget(): string {
  const raw = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(raw);
  return params.get('url') || '';
}

onMounted(() => {
  targetUrl.value = parseTarget();
  const host = container.value;
  if (!host || !targetUrl.value) {
    loading.value = false;
    return;
  }
  const el = document.createElement('webview') as WebviewEl;
  el.setAttribute('src', targetUrl.value);
  el.setAttribute('partition', 'persist:onda-preview');
  el.setAttribute('webpreferences', 'contextIsolation=yes,sandbox=yes,nodeIntegration=no');
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.display = 'flex';
  el.addEventListener('did-finish-load', () => {
    loading.value = false;
  });
  el.addEventListener('did-fail-load', () => {
    loading.value = false;
  });
  host.appendChild(el);
  webview = el;
});

onBeforeUnmount(() => {
  webview?.remove();
  webview = null;
});

function reload(): void {
  webview?.reload();
}

function openExternal(): void {
  if (targetUrl.value) void window.api?.invoke('preview:openExternal', targetUrl.value);
}

function closeWindow(): void {
  window.close();
}
</script>

<template>
  <div class="h-screen flex flex-col bg-base-100 text-base-content">
    <div
      class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-base-300 bg-base-200"
      style="-webkit-app-region: drag"
    >
      <span class="text-xs font-medium truncate flex-1 min-w-0" :title="targetUrl">
        {{ targetUrl || 'Onda Preview' }}
      </span>
      <button
        class="fx-noise p-1.5 rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors"
        :title="L.reload"
        :aria-label="L.reload"
        style="-webkit-app-region: no-drag"
        @click="reload"
      >
        <RefreshCw :size="14" />
      </button>
      <button
        class="fx-noise p-1.5 rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors"
        :title="L.openExternal"
        :aria-label="L.openExternal"
        style="-webkit-app-region: no-drag"
        @click="openExternal"
      >
        <ExternalLink :size="14" />
      </button>
      <button
        class="fx-noise p-1.5 rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors"
        :title="L.close"
        :aria-label="L.close"
        style="-webkit-app-region: no-drag"
        @click="closeWindow"
      >
        <X :size="14" />
      </button>
    </div>

    <div ref="container" class="relative flex-1 min-h-0 bg-neutral">
      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center gap-2 text-base-content/60"
      >
        <Loader2 :size="20" class="animate-spin" />
      </div>
    </div>
  </div>
</template>
