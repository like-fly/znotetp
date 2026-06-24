<script setup lang="ts">
/**
 * Vditor 编辑器核心组件
 *
 * 基于 Vditor 的 WYSIWYG Markdown 编辑器
 * 实现 v-model 兼容，支持外部值同步和输入监听
 */
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import Vditor from "vditor";
import "vditor/dist/index.css";

const props = defineProps<{
    /** 编辑器内容（Markdown 格式） */
    modelValue: string;
    /** 占位提示文本 */
    placeholder?: string;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
    (e: "ready"): void;
}>();

/** 标记是否由内部触发的内容更新，避免循环同步 */
let isInternalUpdate = false;

/** 编辑器挂载容器 */
const editorRef = ref<HTMLDivElement>();

/** Vditor 实例引用 */
let vditor: Vditor | null = null;

/**
 * onMounted 阶段创建 Vditor 实例
 * 使用 DOM ref 作为挂载点，配置所见即所得模式
 */
onMounted(() => {
    if (!editorRef.value) return;

    vditor = new Vditor(editorRef.value, {
        height: "100%",
        mode: "ir", // 即时渲染模式
        placeholder: props.placeholder || "开始编写...",
        value: props.modelValue,
        toolbarConfig: { pin: true },
        cache: { enable: false },
        input(value) {
            if (!isInternalUpdate) {
                emit("update:modelValue", value);
            }
        },
        after() {
            emit("ready");
        },
    });
});

/**
 * 监听外部值变化（切换笔记时同步到编辑器）
 * 使用 isInternalUpdate 标记避免循环更新
 */
watch(
    () => props.modelValue,
    (val) => {
        if (isInternalUpdate) return;
        if (!vditor) return;
        if (val !== vditor.getValue()) {
            isInternalUpdate = true;
            vditor.setValue(val || "");
            nextTick(() => {
                isInternalUpdate = false;
            });
        }
    },
);

/** 组件卸载时销毁 Vditor 实例，释放资源 */
onBeforeUnmount(() => {
    vditor?.destroy();
    vditor = null;
});
</script>

<template>
  <div ref="editorRef" class="vditor-wrapper" />
</template>

<style scoped>
.vditor-wrapper {
  width: 100%;
  height: 100%;
}
</style>
