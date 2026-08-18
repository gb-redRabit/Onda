<script setup lang="ts">
import { onMounted } from 'vue';
import { LogIn, User } from '@lucide/vue';
import { useYoutubeAuth } from '@renderer/composables/useYoutubeAuth';
import YTButton from './YTButton.vue';

const { status, refresh, ensureLoaded } = useYoutubeAuth();

async function login() {
  try {
    await window.api.invoke('yt:login');
  } catch {
    // login window closed or failed — keep current status
  }
  await refresh();
}

onMounted(() => {
  void ensureLoaded();
});
</script>

<template>
  <YTButton
    :variant="status.loggedIn ? 'secondary' : 'primary'"
    size="sm"
    :title="status.loggedIn ? $t('settings.authStatusLoggedIn') : $t('settings.googleAccountDesc')"
    @click="login"
  >
    <User v-if="status.loggedIn" :size="14" />
    <LogIn v-else :size="14" />
    {{ status.loggedIn ? $t('settings.authStatusLoggedIn') : $t('settings.loginWithGoogle') }}
  </YTButton>
</template>
