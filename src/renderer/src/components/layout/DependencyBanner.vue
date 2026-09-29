<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { AlertTriangle, ArrowRight, X } from '@lucide/vue';
import { useMissingDependencies } from '@renderer/composables/useMissingDependencies';

const router = useRouter();
const { issues, visible, check, dismiss, unsubscribe } = useMissingDependencies();

const toolNames = computed(() => issues.value.map((issue) => issue.name).join(', '));

function onWindowFocus(): void {
  void check();
}

onMounted(() => {
  window.addEventListener('focus', onWindowFocus);
  // First probe runs after the shell has painted: the checks spawn processes in
  // the main process and must not compete with the boot sequence.
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => void check(), { timeout: 3000 });
  } else {
    setTimeout(() => void check(), 1000);
  }
});

onUnmounted(() => {
  window.removeEventListener('focus', onWindowFocus);
  unsubscribe();
});

function openDependencies(): void {
  router.push({ path: '/settings', query: { tab: 'dependencies' } });
}
</script>

<template>
  <div
    v-if="visible"
    data-testid="dependency-banner"
    class="flex items-start gap-3 shrink-0 px-4 py-2 border-b border-amber-500/30 bg-amber-500/10"
  >
    <AlertTriangle :size="16" class="mt-0.5 shrink-0 text-amber-500" />
    <div class="min-w-0 flex-1">
      <div class="text-xs font-medium">{{ $t('deps.title') }}</div>
      <div class="text-[11px] text-base-content/70">
        {{ $t('deps.message', { tools: toolNames }) }}
      </div>
      <div class="mt-1.5 flex flex-wrap gap-1">
        <span
          v-for="issue in issues"
          :key="issue.tool"
          class="text-[10px] px-1.5 py-0.5 rounded-field font-medium"
          :class="
            issue.required ? 'bg-error/15 text-error' : 'bg-base-content/10 text-base-content/60'
          "
        >
          {{ issue.name }} —
          {{
            issue.broken
              ? $t('deps.broken')
              : issue.required
                ? $t('deps.required')
                : $t('deps.optional')
          }}
        </span>
      </div>
    </div>
    <button
      class="fx-noise shrink-0 flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors"
      @click="openDependencies"
    >
      <ArrowRight :size="14" />{{ $t('deps.manage') }}
    </button>
    <button
      class="shrink-0 p-1 rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
      :title="$t('deps.dismiss')"
      :aria-label="$t('deps.dismiss')"
      @click="dismiss"
    >
      <X :size="14" />
    </button>
  </div>
</template>
