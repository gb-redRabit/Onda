<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Save, Trash2 } from '@lucide/vue';
import Input from '@renderer/components/ui/Input.vue';
import Select from '@renderer/components/ui/Select.vue';
import Button from '@renderer/components/ui/Button.vue';

const props = defineProps<{
  isSc: boolean;
  profiles: Array<{ id: string; name: string }>;
  selectedId: string;
}>();
const emit = defineEmits<{ select: [string]; save: []; delete: [] }>();
const profileName = defineModel<string>('profileName', { required: true });

const selected = computed({
  get: () => props.selectedId,
  set: (id: string) => emit('select', id)
});

const { t } = useI18n();
</script>

<template>
  <section v-if="!isSc">
    <p class="mb-2 text-xs font-medium uppercase tracking-wider text-base-content/50">
      {{ t('youtube.profilesSection') }}
    </p>
    <div class="flex items-center gap-2">
      <Select v-model="selected" class="min-w-0 flex-1" :aria-label="t('youtube.profilesSection')">
        <option value="">{{ t('youtube.profileNone') }}</option>
        <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
      </Select>
      <Button
        v-if="selectedId"
        variant="ghost"
        size="icon"
        class="shrink-0 hover:text-error"
        :label="t('youtube.profileDelete')"
        :title="t('youtube.profileDelete')"
        @click="emit('delete')"
      >
        <Trash2 :size="14" />
      </Button>
    </div>
    <div class="mt-1.5 flex items-center gap-2">
      <Input
        v-model="profileName"
        class="min-w-0 flex-1"
        :placeholder="t('youtube.profileNamePlaceholder')"
        :aria-label="t('youtube.profileNamePlaceholder')"
      />
      <Button
        variant="outline"
        size="md"
        class="shrink-0"
        :disabled="!profileName.trim()"
        @click="emit('save')"
      >
        <Save :size="13" />
        {{ t('youtube.profileSave') }}
      </Button>
    </div>
  </section>
</template>
