<script setup lang="ts">
/**
 * Vditor 编辑器核心组件
 *
 * 基于 Vditor 的 Markdown 编辑器（即时渲染模式，类似 Typora）
 * 实现 v-model 兼容，支持外部值同步和输入监听
 *
 * 主题配置：
 *   - 编辑器主题：classic（与 Znote 亮色界面协调）
 *   - 内容主题：ant-design（默认）/ light / dark / wechat（用户可在工具栏切换）
 *   - 代码主题：github（带行号）
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
    /** 内容渲染完成（setValue 执行完毕后触发，用于隐藏骨架屏） */
    (e: "rendered"): void;
}>();

/** 标记是否由内部触发的内容更新，避免循环同步 */
let isInternalUpdate = false;

/** 编辑器挂载容器 */
const editorRef = ref<HTMLDivElement>();

/** Vditor 实例引用 */
let vditor: Vditor | null = null;

/** 待执行的 setValue 定时器（用于取消 pending 的延迟渲染，快速连续切换笔记时只保留最后一次） */
let setValueTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * onMounted 阶段创建 Vditor 实例
 * 配置即时渲染模式 + Ant Design 内容主题 + Github 代码主题
 */
onMounted(() => {
    if (!editorRef.value) return;

    vditor = new Vditor(editorRef.value, {
        height: "100%",
        mode: "ir",
        theme: "classic",
        lang: "zh_CN",
        icon: "ant",
        // 所有外部资源（图标/语言包/Lute引擎/高亮/主题CSS）从本地加载，不依赖 CDN
        cdn: "/static/vditor",
        placeholder: props.placeholder || "开始编写...",
        value: props.modelValue,
        toolbarConfig: { pin: true },
        cache: { enable: false },
        counter: { enable: true, type: "text" },
        outline: { enable: false, position: "left" },
        typewriterMode: false,
        preview: {
            theme: {
                current: "ant-design",
            },
            hljs: {
                style: "github",
                lineNumber: true,
            },
            markdown: {
                // autoSpace: true,
                fixTermTypo: true,
                toc: false, // 关闭目录生成，减少每次渲染开销
            },
        },
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
 *
 * 关键性能优化：用 setTimeout(0) 将 setValue 推迟到宏任务执行。
 * Vue watch 默认 flush:'pre'，回调在微任务中执行（paint 之前），
 * 若直接调用 setValue 会阻塞当帧 paint，导致高亮/骨架屏无法及时显示。
 * setTimeout(0) 让浏览器在微任务 flush（更新 DOM）后先 paint 一帧，
 * 再在宏任务中执行同步阻塞的 setValue。
 */
watch(
    () => props.modelValue,
    (val) => {
        if (isInternalUpdate) {
            // 内部更新已渲染，无需再 setValue，通知父组件完成
            emit("rendered");
            return;
        }
        if (!vditor) {
            // 编辑器未初始化，无法渲染，通知父组件完成
            emit("rendered");
            return;
        }

        // 取消上一个 pending 的 setValue（快速连续切换笔记时只保留最后一次）
        if (setValueTimer) {
            clearTimeout(setValueTimer);
            setValueTimer = null;
        }

        if (val !== vditor.getValue()) {
            setValueTimer = setTimeout(() => {
                setValueTimer = null;
                if (!vditor || isInternalUpdate) {
                    emit("rendered");
                    return;
                }
                isInternalUpdate = true;
                vditor.setValue(val || "");
                emit("rendered");
                nextTick(() => {
                    isInternalUpdate = false;
                });
            }, 0);
        } else {
            // 内容未变化（如切回同一篇），直接通知完成
            emit("rendered");
        }
    },
);

/** 组件卸载时清除定时器并销毁 Vditor 实例，释放资源 */
onBeforeUnmount(() => {
    if (setValueTimer) {
        clearTimeout(setValueTimer);
        setValueTimer = null;
    }
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
