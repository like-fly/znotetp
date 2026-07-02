<script setup lang="ts">
/**
 * 笔记元信息条
 *
 * 展示创建时间、修改时间、所在分类。
 * 在标题下方、编辑器上方展示。
 * 最右侧显示保存按钮。
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import type { Note } from "@/types/note";

const { t } = useI18n();

const props = defineProps<{
    note: Note;
    /** 所在分类名称（用于展示） */
    categoryName: string;
    /** 保存按钮 loading 态 */
    saving?: boolean;
    /** 是否处于历史版本查看模式（控制【回到当前】按钮显隐） */
    viewingVersion?: boolean;
    /** 移动端精简模式（隐藏时间和历史按钮，保存按钮改为纯图标） */
    mobile?: boolean;
    /** 自动保存状态：saved 已保存 / saving 保存中 / unsaved 未保存 / undefined 不显示任何指示器 */
    autoSaveStatus?: "saved" | "saving" | "unsaved";
}>();

const emit = defineEmits<{
    (e: "save"): void;
    (e: "history"): void;
    (e: "back-to-current"): void;
}>();

/** 格式化时间：年/月/日 时:分:秒 */
const formatTime = (val: number | string) => {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** 创建时间展示 */
const createdText = computed(() => formatTime(props.note.created_at));
/** 修改时间展示 */
const updatedText = computed(() => formatTime(props.note.updated_at));
</script>

<template>
  <div class="flex items-center justify-between gap-3">
    <!-- 左侧：元信息 -->
    <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500">
      <!-- 所在分类 -->
      <div class="flex items-center gap-1.5">
        <ZIcon name="ri:folder-line" :size="13" color="#94a3b8" />
        <span class="text-slate-400">{{ t("note.meta.notebook") }}：</span>
        <span class="text-slate-700">{{ categoryName }}</span>
      </div>

      <!-- 创建时间 -->
      <div v-if="!mobile" class="flex items-center gap-1.5">
        <ZIcon name="ri:add-circle-line" :size="13" color="#94a3b8" />
        <span class="text-slate-400">{{ t("note.meta.created_at") }}：</span>
        <span class="text-slate-700">{{ createdText }}</span>
      </div>

      <!-- 修改时间 -->
      <div class="flex items-center gap-1.5">
        <ZIcon name="ri:edit-2-line" :size="13" color="#94a3b8" />
        <span class="text-slate-400">{{ t("note.meta.updated_at") }}：</span>
        <span class="text-slate-700">{{ updatedText }}</span>
      </div>
    </div>

    <!-- 右侧：自动保存状态 + 历史按钮 + 保存按钮 -->
    <div class="flex shrink-0 items-center gap-2">
      <!-- 自动保存状态指示器（移动端隐藏） -->
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
      <!-- 回到当前按钮（仅查看历史模式时展示） -->
      <button
        v-if="viewingVersion"
        class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-amber-600 transition hover:bg-amber-50"
        type="button"
        @click="emit('back-to-current')"
      >
        <ZIcon name="ri:arrow-go-back-line" :size="14" color="currentColor" />
        <span>{{ t("note.version.back_to_current") }}</span>
      </button>

      <!-- 历史版本按钮（移动端隐藏） -->
      <button
        v-if="!mobile"
        class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        type="button"
        @click="emit('history')"
      >
        <ZIcon name="ri:history-line" :size="14" color="currentColor" />
        <span>{{ t("note.version.button") }}</span>
      </button>

      <!-- 保存按钮（移动端隐藏，改用顶部导航栏按钮） -->
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
