<script setup lang="ts">
import { onMounted } from 'vue';
import { LogIn, Check } from '@lucide/vue';
import { useYoutubeAuth } from '@renderer/composables/useYoutubeAuth';
import YTAuthButton from '@renderer/components/online/YTAuthButton.vue';

const { status, ensureLoaded } = useYoutubeAuth();

onMounted(() => {
  void ensureLoaded();
});
</script>

<template>
  <div>
    <h3 class="text-lg font-bold tracking-tight mb-1.5">{{ $t('wizard.onlineTitle') }}</h3>
    <p class="text-sm text-base-content/70">{{ $t('wizard.onlineDesc') }}</p>

    <div
      class="mt-5 flex items-center gap-4 p-4 fx-depth rounded-box border border-base-300 bg-base-200/(--glass-alpha)"
    >
      <span
        class="w-11 h-11 shrink-0 rounded-field flex items-center justify-center"
        :class="status.loggedIn ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary'"
      >
        <component :is="status.loggedIn ? Check : LogIn" :size="20" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium">
          {{
            status.loggedIn ? $t('settings.authStatusLoggedIn') : $t('settings.authStatusLoggedOut')
          }}
        </div>
        <p class="text-xs text-base-content/55 mt-0.5">{{ $t('wizard.onlineHint') }}</p>
      </div>
      <YTAuthButton class="shrink-0" />
    </div>
  </div>
</template>
