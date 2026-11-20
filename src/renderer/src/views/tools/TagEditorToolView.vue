<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Plus,
  Save,
  Tags,
  Trash2
} from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import Spinner from '@renderer/components/ui/Spinner.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import Button from '@renderer/components/ui/Button.vue';
import IconButton from '@renderer/components/ui/IconButton.vue';
import Input from '@renderer/components/ui/Input.vue';
import Select from '@renderer/components/ui/Select.vue';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import { useTagEditor } from '@renderer/composables/useTagEditor';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';
import { AUDIO_TAG_FIELDS } from '@shared/types/tools';

const { t } = useI18n();
const prompt = usePromptDialog();

const {
  files,
  loading,
  saving,
  loadError,
  batchField,
  batchValue,
  lastSave,
  coverImagePath,
  coverBusy,
  coverSummary,
  coverError,
  selectedCount,
  dirtyRows,
  allSelected,
  pickFiles,
  onDrop,
  removeRow,
  clearAll,
  toggleAll,
  markDirty,
  applyBatch,
  save,
  pickCoverImage,
  applyCover,
  fieldLabel
} = useTagEditor(prompt);
</script>

<template>
  <ToolWindowShell :title="t('tools.tagEditorTitle')" :icon="Tags">
    <div data-testid="tools-tag-editor-view" class="flex h-full flex-col">
      <div
        class="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2"
        @dragover.prevent
        @drop.prevent="onDrop"
      >
        <Button
          variant="outline"
          size="sm"
          data-testid="tools-tag-add"
          :disabled="saving"
          @click="pickFiles"
        >
          <template #leading><Plus :size="12" /></template>
          {{ t('tools.addFiles') }}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :disabled="saving || files.length === 0"
          @click="clearAll"
        >
          {{ t('tools.clear') }}
        </Button>

        <span class="text-2xs text-base-content/50">
          {{ t('tools.tagEditorSelected', { selected: selectedCount, total: files.length }) }}
        </span>

        <div class="ml-auto flex flex-wrap items-center gap-1.5">
          <Select
            v-model="batchField"
            size="sm"
            data-testid="tools-tag-batch-field"
            :disabled="saving || selectedCount === 0"
          >
            <option v-for="field in AUDIO_TAG_FIELDS" :key="field" :value="field">
              {{ fieldLabel(field) }}
            </option>
          </Select>
          <Input
            v-model="batchValue"
            size="sm"
            class="w-44"
            data-testid="tools-tag-batch-value"
            :disabled="saving || selectedCount === 0"
            :aria-label="t('tools.tagEditorBatchValue')"
            :placeholder="t('tools.tagEditorBatchValue')"
            @keydown.enter="applyBatch"
          />
          <Button
            variant="solid"
            size="sm"
            data-testid="tools-tag-apply"
            :disabled="saving || selectedCount === 0"
            @click="applyBatch"
          >
            {{ t('tools.tagEditorApply') }}
          </Button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2">
        <span class="text-2xs font-medium text-base-content/60">
          {{ t('tools.tagEditorCover') }}
        </span>
        <Input
          v-model="coverImagePath"
          size="sm"
          class="min-w-0 flex-1"
          data-testid="tools-tag-cover-path"
          :disabled="coverBusy"
          :aria-label="t('tools.tagEditorCover')"
          :placeholder="t('tools.tagEditorCoverPick')"
        />
        <Button variant="outline" size="sm" :disabled="coverBusy" @click="pickCoverImage">
          <template #leading><ImageIcon :size="12" /></template>
          {{ t('tools.tagEditorCoverPick') }}
        </Button>
        <Button
          variant="solid"
          size="sm"
          data-testid="tools-tag-cover-apply"
          :disabled="coverBusy || !coverImagePath.trim() || selectedCount === 0"
          :loading="coverBusy"
          @click="applyCover"
        >
          {{ coverBusy ? t('tools.tagEditorCoverApplying') : t('tools.tagEditorCoverApply') }}
        </Button>
        <span
          v-if="coverSummary"
          class="text-2xs"
          :class="coverSummary.failed === 0 ? 'text-success' : 'text-error'"
        >
          {{
            coverSummary.failed === 0
              ? t('tools.tagEditorCoverApplied', { count: coverSummary.ok })
              : t('tools.tagEditorCoverFailedCount', {
                  ok: coverSummary.ok,
                  failed: coverSummary.failed
                })
          }}
        </span>
        <span v-if="coverError" class="text-2xs text-error">{{ coverError }}</span>
        <span class="w-full text-3xs text-base-content/45">
          {{ t('tools.tagEditorCoverHint') }}
        </span>
      </div>

      <p
        v-if="loadError"
        class="border-b border-error/30 bg-error/10 px-3 py-2 text-2xs text-error"
      >
        {{ loadError }}
      </p>

      <div
        data-testid="tools-tag-drop"
        class="min-h-0 flex-1 overflow-auto p-3"
        @dragover.prevent
        @drop.prevent="onDrop"
      >
        <EmptyState
          v-if="files.length === 0 && !loading"
          :title="t('tools.tagEditorEmpty')"
          :description="t('tools.tagEditorDropHint')"
          :icon="Tags"
        />

        <div
          v-else-if="files.length === 0 && loading"
          class="flex h-full items-center justify-center gap-2 p-6 text-sm text-base-content/60"
        >
          <Spinner :size="18" />
          {{ t('tools.tagEditorLoading') }}
        </div>

        <table v-else class="w-full min-w-[980px] border-separate border-spacing-0 text-xs">
          <thead class="sticky top-0 z-10">
            <tr class="text-left text-2xs uppercase tracking-wider text-base-content/50">
              <th class="w-8 border-b border-hairline bg-base-100 px-2 py-2">
                <input
                  type="checkbox"
                  :checked="allSelected"
                  :aria-label="t('tools.tagEditorSelectAll')"
                  @change="toggleAll"
                />
              </th>
              <th class="border-b border-hairline bg-base-100 px-2 py-2">
                {{ t('tools.tagEditorFile') }}
              </th>
              <th
                v-for="field in AUDIO_TAG_FIELDS"
                :key="field"
                class="border-b border-hairline bg-base-100 px-2 py-2"
              >
                {{ fieldLabel(field) }}
              </th>
              <th class="w-8 border-b border-hairline bg-base-100 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in files"
              :key="row.path"
              class="align-top"
              :class="row.selected ? 'bg-primary/5' : ''"
            >
              <td class="border-b border-hairline/60 px-2 py-1.5">
                <input
                  v-model="row.selected"
                  type="checkbox"
                  :disabled="saving"
                  :aria-label="row.name"
                />
              </td>
              <td class="max-w-56 border-b border-hairline/60 px-2 py-1.5">
                <div class="flex items-center gap-1.5">
                  <span class="truncate" :title="row.path">{{ row.name }}</span>
                  <span
                    v-if="!row.writable"
                    class="shrink-0 rounded-full border border-hairline px-1.5 py-0.5 text-4xs text-base-content/50"
                  >
                    {{ t('tools.tagEditorReadOnly') }}
                  </span>
                  <span
                    v-if="row.dirty"
                    class="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-4xs text-primary-text"
                  >
                    {{ t('tools.tagEditorChanged') }}
                  </span>
                </div>
                <p v-if="row.error" class="mt-0.5 text-3xs text-error line-clamp-1">
                  {{ row.error }}
                </p>
                <p v-else-if="row.writeError" class="mt-0.5 text-3xs text-error line-clamp-1">
                  {{ row.writeError }}
                </p>
                <p v-else-if="row.coverError" class="mt-0.5 text-3xs text-error line-clamp-1">
                  {{ row.coverError }}
                </p>
              </td>
              <td
                v-for="field in AUDIO_TAG_FIELDS"
                :key="field"
                class="border-b border-hairline/60 px-1.5 py-1.5"
              >
                <input
                  v-model="row.tags[field]"
                  type="text"
                  :disabled="saving || !row.writable || !!row.error"
                  :aria-label="`${row.name} ${fieldLabel(field)}`"
                  class="w-full min-w-24 rounded-field border border-base-content/15 bg-base-100 px-1.5 py-1 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                  @input="markDirty(row)"
                />
              </td>
              <td class="border-b border-hairline/60 px-1.5 py-1.5">
                <IconButton
                  :icon="Trash2"
                  :label="t('tools.remove')"
                  :size="12"
                  variant="danger"
                  :disabled="saving"
                  @click="removeRow(row.path)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <template #footer>
      <p v-if="lastSave" class="mr-auto flex items-center gap-1.5 text-2xs">
        <CheckCircle2 v-if="lastSave.failed === 0" :size="13" class="text-success" />
        <AlertCircle v-else :size="13" class="text-error" />
        <span :class="lastSave.failed === 0 ? 'text-success' : 'text-error'">
          {{
            lastSave.failed === 0
              ? t('tools.tagEditorSaved', { count: lastSave.ok })
              : t('tools.tagEditorSaveFailedCount', {
                  ok: lastSave.ok,
                  failed: lastSave.failed
                })
          }}
        </span>
      </p>
      <span v-else class="mr-auto text-2xs text-base-content/45">
        {{ loading ? t('tools.tagEditorLoading') : t('tools.tagEditorHint') }}
      </span>
      <Button
        variant="solid"
        data-testid="tools-tag-save"
        :disabled="saving || dirtyRows.length === 0"
        :loading="saving"
        @click="save"
      >
        <template #leading><Save :size="13" /></template>
        {{ saving ? t('tools.tagEditorSaving') : t('tools.tagEditorSave') }}
      </Button>
    </template>

    <ExplorerPromptDialog
      :visible="prompt.promptVisible.value"
      :is-confirm="prompt.promptIsConfirm.value"
      :message="prompt.promptMessage.value"
      :value="prompt.promptValue.value"
      @update:value="prompt.promptValue.value = $event"
      @confirm="prompt.promptConfirm"
      @cancel="prompt.promptCancel"
    />
  </ToolWindowShell>
</template>
