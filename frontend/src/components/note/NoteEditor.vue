<script setup lang="ts">
/**
 * 笔记编辑器包装组件
 *
 * 集成 VditorEditor，保持对外接口不变（v-model）
 */
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

/** 内容变更事件转发 */
const handleUpdate = (value: string) => {
    emit("update:modelValue", value);
};

/** 编辑器就绪事件转发 */
const handleReady = () => {
    emit("ready");
};
</script>

<template>
  <div class="editor-wrapper" :style="{ height: height || '100%' }">
    <VditorEditor
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
