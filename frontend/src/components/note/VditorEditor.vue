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
}>();

/** 标记是否由内部触发的内容更新，避免循环同步 */
let isInternalUpdate = false;

/** 编辑器挂载容器 */
const editorRef = ref<HTMLDivElement>();

/** Vditor 实例引用 */
let vditor: Vditor | null = null;

type EditorMode = "ir" | "sv";

const IMAGE_NODE_SELECTOR = "span.vditor-ir__node[data-type='img']";
const CARET_PLACEHOLDER_PATTERN = /[\s\u200b\u200c\u200d\ufeff]/g;

let irEditorElement: HTMLElement | null = null;
let fallbackExpandedImageNode: HTMLElement | null = null;
let imageExpansionFrame = 0;

/** 判断节点是否为图片边界附近由 Vditor 插入的空白占位内容。 */
const isCaretPlaceholder = (node: Node | null): boolean => {
    if (!node) return false;
    if (node instanceof HTMLElement && (node.tagName === "WBR" || node.tagName === "BR")) return true;
    return node.nodeType === Node.TEXT_NODE &&
        (node.textContent || "").replace(CARET_PLACEHOLDER_PATTERN, "") === "";
};

/** 在同一层级跳过空白占位节点，查找紧邻的图片节点。 */
const findSiblingImage = (
    node: Node | null,
    direction: "previousSibling" | "nextSibling",
): HTMLElement | null => {
    let current = node;
    while (current) {
        if (current instanceof HTMLElement && current.matches(IMAGE_NODE_SELECTOR)) {
            return current;
        }
        if (!isCaretPlaceholder(current)) return null;
        current = current[direction];
    }
    return null;
};

/** 获取选区端点所属的图片节点，用于避免干扰 Vditor 原生图片选区。 */
const getSelectionImageNode = (node: Node | null): HTMLElement | null => {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest<HTMLElement>(IMAGE_NODE_SELECTOR) ?? null;
};

/** 仅识别折叠光标前后紧邻的图片，不介入图片内部的原生 marker 选区。 */
const getCollapsedAdjacentImage = (range: Range): HTMLElement | null => {
    const { startContainer, startOffset } = range;

    if (startContainer.nodeType === Node.ELEMENT_NODE) {
        return findSiblingImage(startContainer.childNodes[startOffset - 1], "previousSibling") ||
            findSiblingImage(startContainer.childNodes[startOffset], "nextSibling");
    }

    if (startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = startContainer as Text;
        if (startOffset === 0) {
            const previousImage = findSiblingImage(textNode.previousSibling, "previousSibling");
            if (previousImage) return previousImage;
        }
        if (startOffset === textNode.length) {
            return findSiblingImage(textNode.nextSibling, "nextSibling");
        }
    }

    return null;
};

/** 只清理由本组件兜底添加的展开态，不触碰 Vditor 原生维护的图片节点。 */
const clearFallbackImageExpansion = (): void => {
    if (fallbackExpandedImageNode?.isConnected) {
        fallbackExpandedImageNode.classList.remove("vditor-ir__node--expand");
    }
    fallbackExpandedImageNode = null;
};

/** 在 Vditor 自身事件完成后，为未被原生逻辑识别的折叠光标边界补充展开态。 */
const syncFallbackImageExpansion = (): void => {
    imageExpansionFrame = 0;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !irEditorElement) {
        clearFallbackImageExpansion();
        return;
    }

    const range = selection.getRangeAt(0);
    if (!irEditorElement.contains(range.startContainer)) {
        clearFallbackImageExpansion();
        return;
    }

    const startImage = getSelectionImageNode(range.startContainer);
    const endImage = getSelectionImageNode(range.endContainer);
    if (!range.collapsed || startImage) {
        if (startImage && startImage === endImage) {
            // 当前图片已由 Vditor 原生选区接管，保留其展开类并释放兜底所有权。
            if (fallbackExpandedImageNode && fallbackExpandedImageNode !== startImage) {
                clearFallbackImageExpansion();
            } else {
                fallbackExpandedImageNode = null;
            }
            return;
        }
        clearFallbackImageExpansion();
        return;
    }

    const adjacentImage = getCollapsedAdjacentImage(range);
    if (adjacentImage === fallbackExpandedImageNode) {
        adjacentImage?.classList.add("vditor-ir__node--expand");
        return;
    }

    clearFallbackImageExpansion();
    if (!adjacentImage || adjacentImage.classList.contains("vditor-ir__node--expand")) return;

    adjacentImage.classList.add("vditor-ir__node--expand");
    adjacentImage.classList.remove("vditor-ir__node--hidden");
    fallbackExpandedImageNode = adjacentImage;
};

/** 延迟到 Vditor 的 click / keyup 内部逻辑执行完毕后再检查折叠光标边界。 */
const scheduleFallbackImageExpansion = (): void => {
    if (imageExpansionFrame) cancelAnimationFrame(imageExpansionFrame);
    imageExpansionFrame = requestAnimationFrame(syncFallbackImageExpansion);
};

/** 绑定图片边界兜底监听；图片点击仍完全交给 Vditor 原生事件处理。 */
const bindImageMarkdownEvents = (): void => {
    if (irEditorElement) return;
    const editor = editorRef.value?.querySelector<HTMLElement>(".vditor-ir .vditor-reset");
    if (!editor) return;

    irEditorElement = editor;
    irEditorElement.addEventListener("mouseup", scheduleFallbackImageExpansion);
    irEditorElement.addEventListener("keyup", scheduleFallbackImageExpansion);
};

/** 解除兜底监听并清理由组件添加的临时展开态。 */
const unbindImageMarkdownEvents = (): void => {
    if (irEditorElement) {
        irEditorElement.removeEventListener("mouseup", scheduleFallbackImageExpansion);
        irEditorElement.removeEventListener("keyup", scheduleFallbackImageExpansion);
    }
    if (imageExpansionFrame) {
        cancelAnimationFrame(imageExpansionFrame);
        imageExpansionFrame = 0;
    }
    clearFallbackImageExpansion();
    irEditorElement = null;
};

/**
 * 获取编辑器当前最新内容
 * 直接从 Vditor 实例取值，避免 input 回调延迟导致 draftContent 不同步
 */
const getContent = (): string => {
    return vditor?.getValue() ?? "";
};

const scrollToHeading = (index: number): void => {
    const root = editorRef.value;
    if (!root) return;
    const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
    const target = headings[index] as HTMLElement | undefined;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
};

/**
 * 将当前光标所在行转换为指定级别标题。
 * 复用 Vditor 内建快捷键逻辑，避免手动解析 IR DOM。
 */
const applyHeading = (level: 1 | 2 | 3 | 4 | 5 | 6): void => {
    if (!vditor) return;
    vditor.focus();
    const currentMode = vditor.getCurrentMode() as "sv" | "wysiwyg" | "ir";
    const editorElement = (vditor as unknown as Record<"sv" | "wysiwyg" | "ir", { element: HTMLElement }>)[currentMode].element;
    const event = new KeyboardEvent("keydown", {
        key: String(level),
        code: `Digit${level}`,
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
    });
    editorElement.dispatchEvent(event);
};

/**
 * 在当前光标位置插入 Markdown 片段。
 */
const insertMarkdownAtCursor = (markdown: string): void => {
    if (!vditor) return;
    vditor.focus();
    vditor.insertMD(markdown);
};

/**
 * 查找当前光标所在的块级节点，IR 模式下每一行都会挂 data-block="0"。
 */
const getCurrentBlockElement = (): HTMLElement | null => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    let node: Node | null = selection.getRangeAt(0).startContainer;
    while (node) {
        if (node instanceof HTMLElement && node.getAttribute("data-block") === "0") {
            return node;
        }
        node = node.parentNode;
    }
    return null;
};

/**
 * 将光标移动到当前块级节点之后，便于在“当前行下一行”插入内容。
 */
const moveCursorAfterCurrentBlock = (): void => {
    const blockElement = getCurrentBlockElement();
    if (!blockElement || !blockElement.parentNode) return;

    const range = document.createRange();
    range.setStartAfter(blockElement);
    range.collapse(true);

    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
};

/**
 * 在当前光标所在行的下一行插入 Markdown 块。
 */
const insertMarkdownBelowCurrentLine = (markdown: string): void => {
    if (!vditor) return;
    vditor.focus();
    moveCursorAfterCurrentBlock();
    vditor.insertMD(markdown);
};

/** 获取当前对外展示的编辑模式。 */
const getEditMode = (): EditorMode => {
    return vditor?.getCurrentMode() === "sv" ? "sv" : "ir";
};

/**
 * 使用 Vditor 内置快捷键切换即时渲染与 Markdown 原文本模式。
 * 复用编辑器自身的模式转换逻辑，确保 Markdown 内容和撤销状态保持一致。
 */
const setEditMode = (mode: EditorMode): void => {
    if (!vditor || getEditMode() === mode) return;

    clearFallbackImageExpansion();
    const currentMode = getEditMode();
    const currentEditorSelector = currentMode === "sv"
        ? ".vditor-sv.vditor-reset"
        : ".vditor-ir .vditor-reset";
    const currentEditor = editorRef.value?.querySelector<HTMLElement>(currentEditorSelector);
    if (!currentEditor) return;

    const useMetaKey = navigator.platform.toUpperCase().includes("MAC");
    const digit = mode === "ir" ? "8" : "9";
    currentEditor.dispatchEvent(new KeyboardEvent("keydown", {
        key: digit,
        code: `Digit${digit}`,
        ctrlKey: !useMetaKey,
        metaKey: useMetaKey,
        altKey: true,
        bubbles: true,
        cancelable: true,
    }));
};

defineExpose({
    getContent,
    getEditMode,
    setEditMode,
    scrollToHeading,
    applyHeading,
    insertMarkdownAtCursor,
    insertMarkdownBelowCurrentLine,
});

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
        toolbar: [],
        toolbarConfig: { pin: false, hide: true },
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
                enable: true,
                lineNumber: true
            },
            markdown: {
                // autoSpace: true,
                fixTermTypo: true,
                toc: false, // 关闭目录生成，减少每次渲染开销
            },
        },
        upload: {
            /** 上传 API 地址 */
            url: (import.meta.env.VITE_API_URL || "") + "/api/user/file/upload",
            /** 单文件上限 10MB */
            max: 10 * 1024 * 1024,
            /** 允许的图片类型 */
            accept: "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/bmp",
            /** 允许多文件上传 */
            multiple: true,
            /** 上传字段名（与后端 file[] 对应） */
            fieldName: "file[]",
            /** 每次上传前动态设置 Bearer Token 认证头 */
            setHeaders() {
                const headers: Record<string, string> = {};
                const token = localStorage.getItem("token");
                if (token) headers.Authorization = `Bearer ${token}`;
                return headers;
            },
            /** 将响应格式转换为 Vditor 内置数据结构 */
            format(_files: File[], responseText: string): string {
                const res = JSON.parse(responseText);
                const succMap: Record<string, string> = {};
                const errFiles: string[] = [];
                if (res.code === 200 && Array.isArray(res.data)) {
                    const baseUrl = import.meta.env.VITE_API_URL || "";
                    for (const item of res.data) {
                        if (item.url && item.original_name) {
                            succMap[item.original_name] = baseUrl + item.url;
                        } else {
                            errFiles.push(item.original_name || "unknown");
                        }
                    }
                } else {
                    for (const file of _files) {
                        errFiles.push(file.name);
                    }
                }
                return JSON.stringify({
                    code: 0,
                    msg: "",
                    data: { errFiles, succMap },
                });
            },
        },
        input(value) {
            if (!isInternalUpdate) {
                emit("update:modelValue", value);
            }
        },
        after() {
            nextTick(() => {
                bindImageMarkdownEvents();
                emit("ready");
            });
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
            clearFallbackImageExpansion();
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
    unbindImageMarkdownEvents();
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
