<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import type { Note } from "@/types/note";

const { t } = useI18n();

const props = defineProps<{
    note: Note;
    saving?: boolean;
    viewingVersion?: boolean;
    mobile?: boolean;
    autoSaveStatus?: "saved" | "saving" | "unsaved";
}>();

const emit = defineEmits<{
    (e: "save"): void;
    (e: "history"): void;
    (e: "back-to-current"): void;
}>();

const formatTime = (val: number | string) => {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const createdText = computed(() => formatTime(props.note.created_at));
const updatedText = computed(() => formatTime(props.note.updated_at));
</script>

<template>
  <div class="flex items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500">
      <div v-if="!mobile" class="flex items-center gap-1.5">
        <ZIcon name="ri:add-circle-line" :size="13" color="#94a3b8" />
        <span class="text-slate-400">{{ t("note.meta.created_at") }}：</span>
        <span class="text-slate-700">{{ createdText }}</span>
      </div>

      <div class="flex items-center gap-1.5">
        <ZIcon name="ri:edit-2-line" :size="13" color="#94a3b8" />
        <span class="text-slate-400">{{ t("note.meta.updated_at") }}：</span>
        <span class="text-slate-700">{{ updatedText }}</span>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <template v-if="!mobile">
        <div v-if="autoSaveStatus === 'saved'" class="flex items-center gap-1 text-xs text-emerald-500">
          <ZIcon name="ri:check-line" :size="12" color="currentColor" />
          <span>{{ t("note.editor.auto_saved") }}</span>
        </div>
        <div v-else-if="autoSaveStatus === 'unsaved'" class="flex items-center gap-1 text-xs text-amber-500">
          <span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span>{{ t("note.editor.unsaved") }}</span>
        </div>
        <div v-else-if="autoSaveStatus === 'saving'" class="flex items-center gap-1 text-xs text-slate-400">
          <ZIcon name="ri:loader-4-line" :size="11" color="currentColor" class="animate-spin" />
          <span>{{ t("note.editor.auto_saving") }}</span>
        </div>
      </template>

      <button
        v-if="viewingVersion"
        class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-amber-600 transition hover:bg-amber-50"
        type="button"
        @click="emit('back-to-current')"
      >
        <ZIcon name="ri:arrow-go-back-line" :size="14" color="currentColor" />
        <span>{{ t("note.version.back_to_current") }}</span>
      </button>

      <button
        v-if="!mobile"
        class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        type="button"
        @click="emit('history')"
      >
        <ZIcon name="ri:history-line" :size="14" color="currentColor" />
        <span>{{ t("note.version.button") }}</span>
      </button>

      <button
        v-if="!mobile"
        class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="saving"
        @click="emit('save')"
      >
        <ZIcon v-if="!saving" name="ri:save-line" :size="14" color="currentColor" />
        <ZIcon v-else name="ri:loader-4-line" :size="14" color="currentColor" class="animate-spin" />
        <span>{{ saving ? t("note.editor.saving") : t("note.editor.save") }}</span>
      </button>
    </div>
  </div>
</template>
