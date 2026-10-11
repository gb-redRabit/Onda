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
let prepared = false;

function create(): void {
  const container = host.value;
  if (!container || !props.src) return;
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

async function setup(): Promise<void> {
  // Skonfiguruj sesję podglądu (spoof/UA) i upewnij się, że bloker jest gotowy,
  // ZANIM załadujemy player — inaczej pierwsze żądania idą bez filtrów.
  if (!prepared) {
    prepared = true;
    try {
      await window.api?.invoke('preview:prepare');
    } catch {
      // best-effort — osadzenie i tak się utworzy
    }
  }
  create();
}

onMounted(() => void setup());

watch(
  () => props.src,
  () => {
    el?.remove();
    el = null;
    if (host.value) host.value.innerHTML = '';
    create();
  }
);

onBeforeUnmount(() => {
  el?.remove();
  el = null;
});
</script>

<template>
  <div ref="host" class="relative w-full h-full" data-testid="embed-webview" />
</template>
