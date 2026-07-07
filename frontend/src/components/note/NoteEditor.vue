<script setup lang="ts">
/**
 * 笔记编辑器包装组件
 *
 * 集成 VditorEditor，保持对外接口不变（v-model）
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import VditorEditor from "./VditorEditor.vue";

const { t } = useI18n();

const props = defineProps<{
    /** 编辑器内容（Markdown 格式） */
    modelValue: string;
    /** 编辑器高度（CSS 值，如 '100%' 或 '500px'） */
    height?: string;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
    (e: "ready"): void;
}>();

/** VditorEditor 组件引用 */
const editorRef = ref<InstanceType<typeof VditorEditor> | null>(null);

/** 内容变更事件转发 */
const handleUpdate = (value: string) => {
    emit("update:modelValue", value);
};

/** 编辑器就绪事件转发 */
const handleReady = () => {
    emit("ready");
};

/**
 * 获取编辑器当前最新内容
 * 直接从 Vditor 实例取值，避免 input 回调延迟导致 draftContent 不同步
 */
const getContent = (): string => {
    return editorRef.value?.getContent() ?? "";
};

const scrollToHeading = (index: number): void => {
    editorRef.value?.scrollToHeading(index);
};

/**
 * 将当前光标所在行设置为指定级别标题。
 */
const applyHeading = (level: 1 | 2 | 3 | 4 | 5 | 6): void => {
    editorRef.value?.applyHeading(level);
};

/**
 * 在光标位置插入 Markdown 片段。
 */
const insertMarkdownAtCursor = (markdown: string): void => {
    editorRef.value?.insertMarkdownAtCursor(markdown);
};

/**
 * 在当前行下一行插入 Markdown 块。
 */
const insertMarkdownBelowCurrentLine = (markdown: string): void => {
    editorRef.value?.insertMarkdownBelowCurrentLine(markdown);
};

defineExpose({ getContent, scrollToHeading, applyHeading, insertMarkdownAtCursor, insertMarkdownBelowCurrentLine });
</script>

<template>
  <div class="editor-wrapper" :style="{ height: height || '100%' }">
    <VditorEditor
      ref="editorRef"
      :model-value="modelValue"
      :placeholder="t('note.editor.placeholder')"
      @update:model-value="handleUpdate"
      @ready="handleReady"
    />
  </div>
</template>

<style scoped>
.editor-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
