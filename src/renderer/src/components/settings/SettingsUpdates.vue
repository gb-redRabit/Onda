<script setup lang="ts">
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h2 class="text-lg font-bold">Aktualizacje</h2>
    <div class="p-4 rounded-xl bg-bg-elevated border border-border-default space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium">Auto-sprawdzaj aktualizacje</div>
          <div class="text-xs text-fg-faint">Automatycznie sprawdzaj nowe wersje</div>
        </div>
        <button class="relative w-10 h-5.5 rounded-full bg-accent-base transition-colors">
          <div class="absolute top-0.75 left-5.5 w-4 h-4 rounded-full bg-white shadow" />
        </button>
      </div>
      <div>
        <label class="text-xs text-fg-faint mb-1 block">Interwał sprawdzania</label>
        <select class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none">
          <option value="startup">Przy starcie</option>
          <option value="hourly">Co godzinę</option>
          <option value="daily">Codziennie</option>
          <option value="weekly">Co tydzień</option>
        </select>
      </div>
      <button class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors">Sprawdź teraz</button>
    </div>
  </div>
</template>
