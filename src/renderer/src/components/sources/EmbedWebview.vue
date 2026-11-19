<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

type WebviewEl = HTMLElement & { reload(): void };

// Osadzenie playera/embedu jako `<webview>` w izolowanej partycji podglądu:
// blokada reklam i spoof nagłówków działają wtedy także inline (iframe tego nie
// potrafi, bo nie da się podmienić jego Referera). Element tworzymy imperatywnie,
// bo `<webview>` nie jest standardowym elementem Vue.
const props = defineProps<{ src: string; title?: string }>();

const host = ref<HTMLElement | null>(null);
let el: WebviewEl | null = null;
let preparePromise: Promise<void> | null = null;

function destroy(): void {
  el?.remove();
  el = null;
  if (host.value) host.value.innerHTML = '';
}

function create(): void {
  const container = host.value;
  if (!container || !props.src) return;
  // Zawsze jeden element: równoległe `setup()`/zmiana `src` nie mogą dołożyć
  // drugiego <webview>, którego nikt już nie usunie.
  destroy();
  const w = document.createElement('webview') as WebviewEl;
  w.setAttribute('src', props.src);
  w.setAttribute('partition', 'persist:onda-preview');
  w.setAttribute('webpreferences', 'contextIsolation=yes,sandbox=yes,nodeIntegration=no');
  // Wypełnienie przez pozycję absolutną — odporne na zerwany łańcuch `height:100%`.
  Object.assign(w.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'flex'
  });
  if (props.title) w.setAttribute('title', props.title);
  container.appendChild(w);
  el = w;
}

function prepare(): Promise<void> {
  if (!preparePromise) {
    preparePromise = Promise.resolve(window.api?.invoke('preview:prepare'))
      .then(() => undefined)
      .catch(() => undefined);
  }
  return preparePromise;
}

async function setup(): Promise<void> {
  // Sesja podglądu (spoof/UA, bloker) musi być gotowa przed pierwszym żądaniem.
  await prepare();
  create();
}

onMounted(() => void setup());

watch(
  () => props.src,
  () => {
    // `setup()` czeka na `prepare`; element powstaje dopiero po nim, więc zmiana
    // `src` w trakcie przygotowania nie tworzy dwóch webviewów.
    destroy();
    void setup();
  }
);

onBeforeUnmount(() => {
  destroy();
});
</script>

<template>
  <div ref="host" class="relative w-full h-full" data-testid="embed-webview" />
</template>
