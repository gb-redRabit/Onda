<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ExternalLink, RefreshCw, X } from '@lucide/vue';
import OnlineButton from '../OnlineButton.vue';
import OnlineIconButton from '../OnlineIconButton.vue';
import OnlineBadge from '../OnlineBadge.vue';
import ProviderIcon from './ProviderIcon.vue';
import { providerLabel } from '@renderer/utils/providerLabels';
import type { RemoteSubscription } from '@shared/types/providers';

// Karta subskrypcji LINKU — wizualnie spójna z kartą kanału (OnlineSubscriptionCard).

const props = defineProps<{
  sub: RemoteSubscription;
  checking?: boolean;
}>();

const emit = defineEmits<{
  open: [];
  check: [];
  remove: [];
  replace: [url: string];
}>();

const { t } = useI18n();
const editing = ref(false);
const editUrl = ref('');

watch(
  () => props.sub.id,
  () => {
    editing.value = false;
    editUrl.value = '';
  }
);

const statusVariant = computed<'green' | 'amber' | 'red'>(() =>
  props.sub.status === 'ok' ? 'green' : props.sub.status === 'expired' ? 'amber' : 'red'
);
const statusLabel = computed(() =>
  props.sub.status === 'ok'
    ? t('providers.statusOk')
    : props.sub.status === 'expired'
      ? t('providers.statusExpired')
      : t('providers.statusError')
);
const lastCheckedLabel = computed(() =>
  props.sub.lastCheckedAt
    ? `${t('youtube.lastChecked')} ${new Date(props.sub.lastCheckedAt).toLocaleString()}`
    : t('youtube.notCheckedYet')
);

function saveReplace(): void {
  const url = editUrl.value.trim();
  if (!url) return;
  emit('replace', url);
  editing.value = false;
  editUrl.value = '';
}
</script>

<template>
  <div
    data-testid="provider-subscription-card"
    class="cv-card flex flex-col p-4 rounded-box bg-base-100 border border-base-300 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
  >
    <div class="flex items-center gap-3">
      <button
        class="shrink-0"
        :title="providerLabel(sub.providerId, sub.providerId, t)"
        @click="emit('open')"
      >
        <ProviderIcon :provider-id="sub.providerId" :label="sub.providerId" :size="44" />
      </button>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="text-sm font-semibold text-base-content truncate hover:text-primary-text transition-colors"
            :title="sub.title"
            @click="emit('open')"
          >
            {{ sub.title }}
          </button>
          <OnlineBadge variant="accent" size="sm">
            {{ providerLabel(sub.providerId, sub.providerId, t) }}
          </OnlineBadge>
          <OnlineBadge :variant="statusVariant" size="sm">{{ statusLabel }}</OnlineBadge>
          <OnlineBadge v-if="sub.newCount" variant="amber" size="sm">
            {{ t('providers.newItems', { count: sub.newCount }) }}
          </OnlineBadge>
        </div>
        <p class="text-[11px] text-base-content/50 mt-0.5 truncate" :title="sub.url">
          {{ sub.url }}
        </p>
        <p class="text-[11px] text-base-content/50">{{ lastCheckedLabel }}</p>
      </div>
    </div>

    <div v-if="sub.status !== 'ok'" class="mt-3">
      <button
        v-if="!editing"
        type="button"
        class="rounded-field border border-base-300 px-2.5 py-1 text-xs text-base-content/80 hover:border-primary hover:text-primary-text"
        data-testid="providers-replace"
        @click="editing = true"
      >
        {{ t('providers.pasteNewLink') }}
      </button>
      <div v-else class="flex items-center gap-2">
        <input
          v-model="editUrl"
          type="text"
          class="flex-1 min-w-0 rounded-field border border-base-300 bg-base-100 px-2 py-1 text-xs text-base-content outline-none focus:border-primary"
          :aria-label="t('providers.pasteNewLink')"
          :placeholder="t('providers.pasteNewLink')"
          @keydown.enter="saveReplace"
        />
        <OnlineButton variant="primary" size="sm" @click="saveReplace">
          {{ t('providers.replace') }}
        </OnlineButton>
        <OnlineIconButton :title="t('common.cancel')" @click="editing = false">
          <X :size="14" />
        </OnlineIconButton>
      </div>
    </div>

    <div class="mt-auto pt-3 flex items-center gap-2 flex-wrap">
      <OnlineButton variant="primary" size="sm" :title="t('providers.open')" @click="emit('open')">
        <ExternalLink :size="12" /> {{ t('providers.open') }}
      </OnlineButton>
      <div class="flex-1" />
      <OnlineIconButton :disabled="checking" :title="t('providers.check')" @click="emit('check')">
        <RefreshCw :size="14" :class="checking ? 'animate-spin' : ''" />
      </OnlineIconButton>
      <OnlineIconButton variant="danger" :title="t('common.delete')" @click="emit('remove')">
        <X :size="14" />
      </OnlineIconButton>
    </div>
  </div>
</template>
