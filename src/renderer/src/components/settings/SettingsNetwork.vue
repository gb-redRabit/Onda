<script setup lang="ts"></script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h2 class="text-lg font-bold">{{ $t('settings.networkSection') }}</h2>
    <div class="p-4 rounded-xl bg-bg-elevated border border-border-default space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-sm">{{ $t('settings.enableProxy') }}</span>
        <button class="relative w-10 h-5.5 rounded-full bg-border-subtle transition-colors">
          <div class="absolute top-0.75 left-0.75 w-4 h-4 rounded-full bg-white shadow" />
        </button>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <input
          placeholder="Host"
          class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
        />
        <input
          placeholder="Port"
          type="number"
          class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
        />
        <select
          class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
        >
          <option>HTTP</option>
          <option>HTTPS</option>
          <option>SOCKS5</option>
        </select>
      </div>
    </div>
  </div>
</template>
