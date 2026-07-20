<script setup lang="ts">
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h2 class="text-lg font-bold">Klucze API</h2>
    <div class="p-4 rounded-xl bg-bg-elevated border border-border-default space-y-3">
      <div>
        <label class="text-xs text-fg-faint mb-1 block">YouTube Data API v3 — Klucz API</label>
        <input type="password" placeholder="Wpisz klucz API YouTube..."
          class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-fg-faint mb-1 block">Maks. wyników (1-50)</label>
          <input type="number" min="1" max="50" value="25"
            class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none" />
        </div>
        <div>
          <label class="text-xs text-fg-faint mb-1 block">Kod regionu</label>
          <input type="text" value="US" maxlength="2"
            class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none" />
        </div>
      </div>
      <button class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors">Zapisz klucz API</button>
    </div>
  </div>
</template>
