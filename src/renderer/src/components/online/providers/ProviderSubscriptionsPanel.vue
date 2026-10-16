<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Link2, RefreshCw } from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import Loader from '@renderer/components/layout/Loader.vue';
import OnlineButton from '../OnlineButton.vue';
import ProviderSubscriptionCard from './ProviderSubscriptionCard.vue';
import { useProviderSubsStore } from '@renderer/stores/providerSubs';
import { useSettingsStore } from '@renderer/stores/settings';

// Sekcja „Subskrypcje linków" — spójna z listą kanałów (ta sama siatka i karty).

const emit = defineEmits<{ open: [url: string] }>();
const { t } = useI18n();
const store = useProviderSubsStore();
const settings = useSettingsStore();

const autoCheck = computed(() => settings.download.autoCheckLinkSubscriptions);
function toggleAutoCheck(): void {
  settings.updateDownload({ autoCheckLinkSubscriptions: !autoCheck.value });
}

onMounted(() => {
  if (!store.loaded) void store.load();
});
</script>

<template>
  <section class="space-y-4" data-testid="provider-subs">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h3 class="text-sm font-semibold text-base-content/80">{{ t('providers.subsTitle') }}</h3>
      <div class="flex flex-wrap items-center gap-3">
        <label
          class="flex items-center gap-1.5 text-xs text-base-content/70 cursor-pointer select-none"
        >
          <input
            type="checkbox"
            class="accent-primary"
            :checked="autoCheck"
            @change="toggleAutoCheck"
          />
          <span>{{ t('providers.autoCheck') }}</span>
        </label>
        <OnlineButton
          variant="secondary"
          size="sm"
          data-testid="providers-check-all"
          @click="store.checkAll()"
        >
          <RefreshCw :size="12" /> {{ t('providers.checkAll') }}
        </OnlineButton>
      </div>
    </div>

    <Loader v-if="!store.loaded" :label="$t('common.loading')" />

    <EmptyState
      v-else-if="store.subs.length === 0"
      variant="plain"
      :icon="Link2"
      :title="t('providers.subsEmpty')"
    />

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <ProviderSubscriptionCard
        v-for="sub in store.subs"
        :key="sub.id"
        :sub="sub"
        @open="emit('open', sub.url)"
        @check="store.check(sub.id)"
        @remove="store.remove(sub.id)"
        @replace="(url) => store.replaceLink(sub.id, url)"
      />
    </div>
  </section>
</template>
