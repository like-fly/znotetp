<script setup lang="ts">
/**
 * AI 对话视图
 *
 * 左右分栏：左侧会话列表，右侧聊天区域。
 * SSE 流式对话，支持多轮对话和会话管理。
 * 移动端左侧栏以抽屉形式展示。
 *
 * Props:
 *   - forceMobileLayout: 强制使用移动端布局（隐藏 PC 侧栏，始终显示顶栏汉堡+新对话）
 *     默认 false（保持原响应式行为）；传 true 则无视屏幕宽度强制移动端布局
 */
import { ref, computed, h, nextTick, onMounted, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { NDrawer, NDrawerContent, NSpin } from "naive-ui";
import { IncremarkContent, ThemeProvider } from "@incremark/vue";
import type { DesignTokens } from "@incremark/theme";
import "@incremark/theme/styles.css";
import ZIcon from "@/components/DynamicIcon.vue";

/** 强制使用移动端布局 */
const props = withDefaults(
    defineProps<{
        forceMobileLayout?: boolean;
    }>(),
    {
        forceMobileLayout: false,
    },
);
import { fetchTopNotebooks } from "@/api/notebook";
import { fetchThreads, fetchThreadDetail, deleteThread, fetchAIStatus } from "@/api/ai";
import type { Notebook } from "@/types/note";

const { t } = useI18n();

/** 代码块主题 */
const codeTheme = {
    color: {
        code: {
            blockBackground: "#1e293b",
            blockText: "#e2e8f0",
            inlineBackground: "#334155",
            inlineText: "#e2e8f0",
            headerBackground: "#0f172a",
        },
    },
} as Partial<DesignTokens>;

/** 工具调用信息 */
interface ToolCall {
    id: string;
    name: string;
    input?: any;
    inputText?: string;
    result?: any;
    status: "running" | "completed";
    _expanded?: boolean;
}

/** 对话消息 */
interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    isStreaming?: boolean;
    toolCalls?: ToolCall[];
}

// ==================== 状态 ====================

const threads = ref<{ id: string; createdAt: string; updatedAt?: string; title?: string; resourceId: string }[]>([]);
const selectedThreadId = ref<string | null>(null);
const messages = ref<ChatMessage[]>([]);
const notebooks = ref<Notebook[]>([]);
const notebookId = ref<number | null>(null);
const inputMessage = ref("");
const isLoading = ref(false);
const isStreaming = ref(false);
const isSidebarOpen = ref(false);
const loadingThreads = ref(false);
const loadingMessages = ref(false);
const abortController = ref<AbortController | null>(null);

/** AI 功能启用状态：默认 true（避免首屏闪烁），请求完毕后按接口结果调整 */
const aiEnabled = ref(true);

/** 检查 AI 状态：失败静默降级,保持默认 true 不阻塞用户 */
const checkAIStatus = async () => {
    try {
        aiEnabled.value = await fetchAIStatus();
    } catch {
        aiEnabled.value = true;
    }
};

/** 滚动到消息底部 */
const messageContainer = ref<HTMLElement | null>(null);
const scrollToBottom = () => {
    nextTick(() => {
        if (messageContainer.value) {
            messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
        }
    });
};

/** 「滚动到底部」按钮可见性
 *  仅在内容溢出（scrollHeight > clientHeight）且距底部 > 50px 时显示
 *  满足用户「窗口高度不够（内容不溢出）时不显示按钮」的需求
 */
const showScrollToBottom = ref(false);

const handleScroll = () => {
    if (!messageContainer.value) return;
    const { scrollTop, scrollHeight, clientHeight } = messageContainer.value;
    const hasOverflow = scrollHeight > clientHeight + 1;
    const distFromBottom = scrollHeight - scrollTop - clientHeight;
    showScrollToBottom.value = hasOverflow && distFromBottom > 50;
};

/** 平滑滚动到消息底部 */
const onScrollToBottom = () => {
    if (messageContainer.value) {
        messageContainer.value.scrollTo({ top: messageContainer.value.scrollHeight, behavior: "smooth" });
    }
};

/** 当前选中笔记本的标题（供 trigger 按钮展示） */
const currentNotebookTitle = computed(() => {
    const nb = notebooks.value.find((n) => n.id === notebookId.value);
    return nb?.title ?? "";
});

/** 笔记本下拉菜单：开合控制 + 点击外部关闭 + 选中即关闭 */
const showNotebookMenu = ref(false);
const notebookButtonRef = ref<HTMLElement | null>(null);
const notebookMenuRef = ref<HTMLElement | null>(null);

/** 点击外部关闭菜单（trigger 和 menu 内部的点击不触发） */
const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Node;
    if (notebookMenuRef.value?.contains(target)) return;
    if (notebookButtonRef.value?.contains(target)) return;
    showNotebookMenu.value = false;
};

/** 选中笔记本并关闭菜单 */
const handleSelectNotebook = (id: number) => {
    notebookId.value = id;
    showNotebookMenu.value = false;
};

onMounted(() => {
    document.addEventListener("click", handleClickOutside);
});
onBeforeUnmount(() => {
    document.removeEventListener("click", handleClickOutside);
    messageContainer.value?.removeEventListener("scroll", handleScroll);
});

/** textarea 自动撑高：默认 1 行,内容多时自动增长,上限 3 行(约 88px) */
const TEXTAREA_MAX_HEIGHT = 88;
/** compact → expanded 切换的高度阈值(约 2.5 行,> 2 行后开始两段式布局) */
const COMPACT_THRESHOLD = 60;
/** 是否处于「内容多」状态(> 2 行),用于切换 grid 模板 */
const isTall = ref(false);
/** textarea DOM 引用,用于在 send 清空等程序化变更时同步高度 */
const textareaRef = ref<HTMLTextAreaElement | null>(null);

/** 单一职责:设置 textarea 高度并更新 isTall */
const growTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    const h = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
    isTall.value = h > COMPACT_THRESHOLD;
};

const autoGrow = (e: Event) => {
    growTextarea(e.target as HTMLTextAreaElement);
};

/** 自动聚焦输入框
 *  - 仅在输入框可用（有笔记本）和非流式响应时聚焦
 *  - disabled 元素 focus() 会被浏览器忽略,所以未选笔记本时此函数为 no-op
 */
const focusInput = () => {
    if (textareaRef.value && notebookId.value && !isStreaming.value) {
        textareaRef.value.focus();
    }
};

/** 监听 inputMessage 变化,程序化修改(如 send 后清空)时同步高度和布局 */
watch(inputMessage, () => {
    if (textareaRef.value) growTextarea(textareaRef.value);
});

/** 当前选中线程 */
const currentThread = computed(() =>
    threads.value.find((t) => t.id === selectedThreadId.value),
);

/** 是否有消息 */
const hasMessages = computed(() => messages.value.length > 0);

// ==================== 方法 ====================

/** 加载会话列表 */
const loadThreads = async () => {
    loadingThreads.value = true;
    try {
        threads.value = await fetchThreads();
        threads.value.sort(
            (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
        );
    } finally {
        loadingThreads.value = false;
    }
};

/** 加载笔记本列表 */
const loadNotebooks = async () => {
    notebooks.value = await fetchTopNotebooks();
};

/** 获取线程标题（首条消息截断或时间） */
const getThreadTitle = (thread: typeof threads.value[0]) => {
    if (thread.title) return thread.title;
    const d = new Date(thread.createdAt);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

/** 从 Mastra Memory 的结构化 content 中提取纯文本 */
const extractMessageContent = (content: any): string => {
    if (typeof content === "string") return content;
    if (content?.content) return content.content;
    // format: 2 格式：parts 数组中 type:"text" 的条目拼接
    if (Array.isArray(content?.parts)) {
        return content.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
    }
    return "";
};

/** 新建对话 */
const startNewThread = () => {
    // 生成 16 位 thread_id
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    for (let i = 0; i < 16; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    selectedThreadId.value = id;
    messages.value = [];
    isSidebarOpen.value = false;
    // 新建会话后自动聚焦输入框（等待 DOM 更新后）
    nextTick(() => focusInput());
};

/** 选中历史会话 */
const selectThread = async (threadId: string) => {
    selectedThreadId.value = threadId;
    messages.value = [];
    loadingMessages.value = true;
    isSidebarOpen.value = false;

    try {
        const detail = await fetchThreadDetail(threadId);
        if (detail) {
            messages.value = detail.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: extractMessageContent(m.content),
                isStreaming: false,
            }));
        }
    } finally {
        loadingMessages.value = false;
        scrollToBottom();
    }
};

/** 删除会话 */
const handleDeleteThread = async (threadId: string, event: Event) => {
    event.stopPropagation();
    const ok = await deleteThread(threadId);
    if (ok) {
        threads.value = threads.value.filter((t) => t.id !== threadId);
        if (selectedThreadId.value === threadId) {
            selectedThreadId.value = null;
            messages.value = [];
        }
    }
};

/** 发送消息（内联 SSE 处理，直接操作 messages.value[index] 确保 Vue 响应式） */
const sendMessage = async () => {
    const text = inputMessage.value.trim();
    if (!text || isStreaming.value) return;
    if (!notebookId.value) return;

    // 隐式创建：首次发送时若无 thread 则自动生成
    if (!selectedThreadId.value) {
        startNewThread();
    }

    inputMessage.value = "";
    isStreaming.value = true;

    // 添加用户消息
    messages.value.push({
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
    });

    // 添加 AI 消息占位
    messages.value.push({
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: "",
        isStreaming: true,
    });
    const aiIndex = messages.value.length - 1;

    const controller = new AbortController();
    abortController.value = controller;

    const token = localStorage.getItem("token");
    const BASE_URL = import.meta.env.VITE_API_URL || "/";

    try {
        const response = await fetch(`${BASE_URL}/api/user/ai/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": token ? `Bearer ${token}` : "",
            },
            body: JSON.stringify({ notebook_id: notebookId.value, thread_id: selectedThreadId.value, message: text }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            let errMsg = `HTTP ${response.status}`;
            try { errMsg = JSON.parse(body).msg || errMsg; } catch { /* ignore */ }
            messages.value[aiIndex].content = `❌ ${errMsg}`;
            messages.value[aiIndex].isStreaming = false;
            isStreaming.value = false;
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            messages.value[aiIndex].content = "❌ 无法读取响应流";
            messages.value[aiIndex].isStreaming = false;
            isStreaming.value = false;
            return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6);
                if (raw === "[DONE]") continue;

                try {
                    const chunk = JSON.parse(raw);

                    // 工具调用开始（参数流式输入）
                    if (chunk.type === "tool-call-input-streaming-start") {
                        const msgRef = messages.value[aiIndex];
                        if (!msgRef.toolCalls) msgRef.toolCalls = [];
                        msgRef.toolCalls.push({
                            id: chunk.payload?.toolCallId || "",
                            name: chunk.payload?.toolName || "unknown",
                            inputText: "",
                            status: "running",
                        });
                        scrollToBottom();
                    }
                    // 工具调用参数增量
                    else if (chunk.type === "tool-call-delta") {
                        const tc = messages.value[aiIndex].toolCalls?.find(
                            (t: any) => t.id === chunk.payload?.toolCallId,
                        );
                        if (tc) {
                            tc.inputText = (tc.inputText || "") + (chunk.payload?.argsTextDelta || "");
                        }
                    }
                    // 工具调用参数完整（也出现在 step-start 的 messages 中，但直接处理 tool-call 事件更可靠）
                    else if (chunk.type === "tool-call") {
                        const tc = messages.value[aiIndex].toolCalls?.find(
                            (t: any) => t.id === chunk.payload?.toolCallId,
                        );
                        if (tc && chunk.payload?.args) {
                            tc.input = chunk.payload.args;
                        }
                    }
                    // 工具执行结果
                    else if (chunk.type === "tool-result") {
                        const tc = messages.value[aiIndex].toolCalls?.find(
                            (t: any) => t.id === chunk.payload?.toolCallId,
                        );
                        if (tc) {
                            tc.status = "completed";
                            tc.result = chunk.payload?.result || chunk.payload;
                        }
                        scrollToBottom();
                    }
                    // 文本增量
                    else if (chunk.type === "text-delta" && chunk.payload?.text) {
                        messages.value[aiIndex].content += chunk.payload.text;
                        scrollToBottom();
                    }
                    // 对话结束
                    else if (chunk.type === "finish") {
                        messages.value[aiIndex].isStreaming = false;
                        isStreaming.value = false;
                        scrollToBottom();
                        loadThreads();
                        return;
                    }
                    // 错误事件
                    else if (chunk.type === "error") {
                        if (messages.value[aiIndex].content === "") {
                            messages.value[aiIndex].content = `❌ ${chunk.error || "未知错误"}`;
                        }
                        messages.value[aiIndex].isStreaming = false;
                        isStreaming.value = false;
                        return;
                    }
                } catch { /* 忽略非 JSON 行 */ }
            }
        }
    } catch (err: any) {
        if (err.name !== "AbortError") {
            if (messages.value[aiIndex].content === "") {
                messages.value[aiIndex].content = `❌ ${err.message || "网络错误"}`;
            }
            messages.value[aiIndex].isStreaming = false;
            isStreaming.value = false;
        }
    } finally {
        messages.value[aiIndex].isStreaming = false;
        isStreaming.value = false;
        scrollToBottom();
    }
};

/** 停止生成 */
const stopStreaming = () => {
    abortController.value?.abort();
    const lastMsg = messages.value[messages.value.length - 1];
    if (lastMsg?.isStreaming) {
        lastMsg.isStreaming = false;
    }
    isStreaming.value = false;
};

/** 键盘事件 */
const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};

/** 格式化工具结果（截断过长内容） */
const formatToolResult = (result: any): string => {
    if (typeof result === "string") {
        return result.length > 500 ? result.slice(0, 500) + "..." : result;
    }
    const str = JSON.stringify(result, null, 2);
    return str.length > 500 ? str.slice(0, 500) + "..." : str;
};

/** 监听线程切换，自动滚动 */
watch(selectedThreadId, () => {
    scrollToBottom();
});

onMounted(async () => {
    // 异步检查 AI 启用状态(不 await,不等它完成,避免阻塞其他初始化)
    checkAIStatus();

    await Promise.all([loadThreads(), loadNotebooks()]);
    // 只读默认 + 单向跟随：从 localStorage 读取当前激活的笔记本 id
    const saved = localStorage.getItem("note-active-notebook-id");
    const savedId = saved ? Number(saved) : null;
    if (savedId && notebooks.value.some((nb) => nb.id === savedId)) {
        notebookId.value = savedId;
    } else if (notebooks.value.length > 0) {
        notebookId.value = notebooks.value[0].id;
    }
    // 首屏自动聚焦输入框（等待 DOM 更新后）
    await nextTick();
    focusInput();

    // 绑定消息区滚动事件（被动监听,不阻塞滚动）
    messageContainer.value?.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
});
</script>

<template>
    <div class="flex h-[100dvh] bg-white dark:bg-slate-950">
        <!-- AI 未启用：完全替换原内容,只显示禁用提示 -->
        <div
            v-if="!aiEnabled"
            class="flex flex-1 flex-col items-center justify-center bg-white px-6 text-center dark:bg-slate-950"
        >
            <ZIcon name="ri:robot-2-line" :size="72" class="mb-4 text-slate-300 dark:text-slate-600" />
            <div class="text-lg font-medium text-slate-700 dark:text-slate-300">
                {{ t("ai.disabled.title") }}
            </div>
            <div class="mt-2 max-w-md text-sm text-slate-400 dark:text-slate-500">
                {{ t("ai.disabled.description") }}
            </div>
        </div>

        <!-- AI 启用：原所有内容 -->
        <template v-else>
        <!-- ====== PC 端左侧栏 ====== -->
        <aside
            :class="props.forceMobileLayout
                ? 'hidden'
                : 'hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50 md:flex dark:border-slate-800 dark:bg-slate-900'"
        >
            <!-- 新对话按钮 -->
            <div class="border-b border-slate-200 p-3 dark:border-slate-800">
                <button
                    type="button"
                    class="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#86A6CA] to-[#4A6FA5] px-4 py-2.5 text-sm font-medium text-white shadow-[0_4px_12px_rgba(74,111,165,0.3)] transition hover:from-[#7B9BBD] hover:to-[#3F5F95] hover:shadow-[0_6px_16px_rgba(74,111,165,0.4)] active:from-[#6F8DAE] active:to-[#345485] active:shadow-[0_2px_8px_rgba(74,111,165,0.35)] dark:shadow-[0_4px_16px_rgba(134,166,202,0.25)] dark:hover:shadow-[0_6px_20px_rgba(134,166,202,0.35)]"
                    @click="startNewThread"
                >
                    <ZIcon name="ri:add-line" :size="18" />
                    {{ t("ai.chat.new_thread") }}
                </button>
            </div>

            <!-- 会话列表 -->
            <div class="ai-thin-scrollbar flex-1 overflow-y-auto px-2 py-2">
                <NSpin :show="loadingThreads" size="small">
                    <div v-if="threads.length === 0" class="py-8 text-center text-sm text-slate-400">
                        {{ t("ai.chat.no_threads") }}
                    </div>
                    <div v-for="thread in threads" :key="thread.id" class="mb-1">
                        <div
                            class="group flex cursor-pointer items-center rounded-lg px-3 py-2.5 text-sm transition"
                            :class="selectedThreadId === thread.id
                                ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'"
                            @click="selectThread(thread.id)"
                        >
                            <span class="flex-1 truncate">{{ getThreadTitle(thread) }}</span>
                            <button
                                class="ml-1 shrink-0 rounded p-1 opacity-0 transition hover:bg-slate-300 group-hover:opacity-100 dark:hover:bg-slate-600"
                                @click="handleDeleteThread(thread.id, $event)"
                                :title="t('ai.chat.delete_thread')"
                            >
                                <ZIcon name="ri:delete-bin-line" :size="14" class="text-slate-400" />
                            </button>
                        </div>
                    </div>
                </NSpin>
            </div>
        </aside>

        <!-- ====== 移动端抽屉 ====== -->
        <NDrawer v-model:show="isSidebarOpen" placement="left" :width="280">
            <NDrawerContent :title="t('ai.chat.title')" closable>
                <div class="flex flex-col">
                    <div v-if="threads.length === 0" class="py-8 text-center text-sm text-slate-400">
                        {{ t("ai.chat.no_threads") }}
                    </div>
                    <div v-for="thread in threads" :key="thread.id" class="mb-1">
                        <div
                            class="flex cursor-pointer items-center rounded-lg px-3 py-2.5 text-sm transition"
                            :class="selectedThreadId === thread.id
                                ? 'bg-slate-200 text-slate-900'
                                : 'text-slate-600 hover:bg-slate-100'"
                            @click="selectThread(thread.id)"
                        >
                            <span class="flex-1 truncate">{{ getThreadTitle(thread) }}</span>
                            <button
                                class="ml-1 shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200"
                                @click="handleDeleteThread(thread.id, $event)"
                            >
                                <ZIcon name="ri:delete-bin-line" :size="14" />
                            </button>
                        </div>
                    </div>
                </div>
            </NDrawerContent>
        </NDrawer>

        <!-- ====== 右侧主聊天区 ====== -->
        <div class="flex flex-1 flex-col min-w-0">
            <!-- 移动端固定顶栏：48px 高,汉堡左 + 新对话右,不随内容滚动 -->
            <div
                :class="props.forceMobileLayout
                    ? 'flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-950'
                    : 'flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 md:hidden dark:border-slate-800 dark:bg-slate-950'"
            >
                <button
                    class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    @click="isSidebarOpen = true"
                >
                    <ZIcon name="ri:menu-line" :size="20" />
                </button>
                <button
                    class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    @click="startNewThread"
                >
                    <ZIcon name="ri:add-line" :size="18" />
                    {{ t("ai.chat.new_thread") }}
                </button>
            </div>

            <!-- 消息区 -->
            <div ref="messageContainer" class="ai-thin-scrollbar relative flex-1 overflow-y-auto">
                <!-- 滚动到底部按钮：内容溢出且不在底部时,底部居中显示 -->
                <Transition name="ai-fade">
                    <button
                        v-if="showScrollToBottom"
                        class="absolute bottom-3 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-600 shadow-sm backdrop-blur-sm transition hover:border-[#86A6CA] hover:text-[#4A6FA5] hover:shadow-md dark:border-slate-700/60 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:border-[#86A6CA] dark:hover:text-[#7DA3CC]"
                        title="滚动到底部"
                        @click="onScrollToBottom"
                    >
                        <ZIcon name="ri:arrow-down-line" :size="18" />
                    </button>
                </Transition>
                <div class="mx-auto h-full max-w-3xl px-4 py-6">
                    <!-- 加载历史消息 -->
                    <div v-if="loadingMessages" class="flex h-full items-center justify-center">
                        <NSpin size="small" />
                    </div>

                    <!-- 欢迎引导 -->
                    <div
                        v-else-if="!hasMessages"
                        class="flex h-full flex-col items-center justify-center text-center"
                    >
                        <ZIcon
                            name="ri:robot-2-line"
                            :size="72"
                            class="mb-4 text-[#4A6FA5] drop-shadow-[0_4px_12px_rgba(74,111,165,0.4)] dark:text-[#7DA3CC] dark:drop-shadow-[0_4px_12px_rgba(125,163,204,0.5)]"
                        />
                        <div class="text-lg font-medium text-slate-700 dark:text-slate-300">
                            {{ t("ai.chat.title") }}
                        </div>
                        <div class="mt-2 text-sm text-slate-400">
                            {{ t("ai.chat.empty") }}
                        </div>
                    </div>

                    <!-- 消息列表 -->
                    <div v-else class="space-y-6">
                        <div
                            v-for="msg in messages"
                            :key="msg.id"
                            class="flex"
                            :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
                        >
                            <!-- 用户消息 -->
                            <div
                                v-if="msg.role === 'user'"
                                class="max-w-[85%] rounded-2xl rounded-br-md bg-blue-500 px-4 py-3 text-sm leading-relaxed text-white"
                            >
                                {{ msg.content }}
                            </div>

                            <!-- AI 消息 -->
                                <div
                                    v-else
                                    class="w-[100%] mb-[2em] rounded-2xl border border-slate-200 bg-slate-50/20 px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-800/10 dark:text-slate-200"
                                >
                                <!-- 工具链调用展示 -->
                                <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="mb-3">
                                    <div v-for="tool in msg.toolCalls" :key="tool.id" class="mb-2">
                                        <div
                                            class="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-200/50 px-3 py-2 text-xs transition hover:bg-slate-200 dark:bg-slate-700/50 dark:hover:bg-slate-700"
                                            @click="tool._expanded = !tool._expanded"
                                        >
                                            <ZIcon
                                                :name="tool.status === 'running' ? 'ri:loader-4-line' : 'ri:check-line'"
                                                :size="14"
                                                :class="tool.status === 'running' ? 'animate-spin text-blue-500' : 'text-green-500'"
                                            />
                                            <span class="font-medium text-slate-600 dark:text-slate-300">
                                                {{ tool.name }}
                                            </span>
                                            <span class="text-slate-400">
                                                {{ tool.status === 'running' ? t('ai.tool.running') : t('ai.tool.completed') }}
                                            </span>
                                            <ZIcon
                                                name="ri:arrow-down-s-line"
                                                :size="14"
                                                class="ml-auto text-slate-400 transition-transform"
                                                :class="{ 'rotate-180': tool._expanded }"
                                            />
                                        </div>
                                        <!-- 工具详情（可折叠） -->
                                        <div v-if="tool._expanded" class="mt-1 max-h-96 overflow-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">
                                            <!-- 输入参数 -->
                                            <div v-if="tool.input || tool.inputText" class="mb-2">
                                                <div class="mb-1 font-medium text-slate-500">{{ t('ai.tool.input') }}</div>
                                                <pre class="overflow-x-auto whitespace-pre-wrap text-slate-600 dark:text-slate-400">{{ tool.input ? JSON.stringify(tool.input, null, 2) : tool.inputText }}</pre>
                                            </div>
                                            <!-- 执行结果 -->
                                            <div v-if="tool.result">
                                                <div class="mb-1 font-medium text-slate-500">{{ t('ai.tool.result') }}</div>
                                                <!-- 标准格式：{ context, sources } → context 用 Incremark 渲染 -->
                                                <template v-if="tool.result.context">
                                                    <div class="ai-markdown">
                                                        <ThemeProvider :theme="codeTheme">
                                                            <IncremarkContent
                                                                :content="tool.result.context"
                                                                :is-finished="true"
                                                            />
                                                        </ThemeProvider>
                                                    </div>
                                                    <div v-if="tool.result.sources?.length" class="mt-2">
                                                        <div class="mb-1 text-[11px] font-medium text-slate-400 uppercase">Sources</div>
                                                        <ul class="list-inside list-disc space-y-0.5 text-slate-500">
                                                            <li v-for="s in tool.result.sources" :key="s.id">
                                                                {{ s.title }} <span class="text-slate-300">#{{ s.id }}</span>
                                                            </li>
                                                        </ul>
                                                    </div>
                                                </template>
                                                <!-- 非标准格式兼容 -->
                                                <pre v-else class="max-h-60 overflow-auto whitespace-pre-wrap text-slate-600 dark:text-slate-400">{{ formatToolResult(tool.result) }}</pre>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 消息内容（IncremarkContent 实时渲染） -->
                                <template v-if="msg.content">
                                    <div class="ai-markdown">
                                        <ThemeProvider :theme="codeTheme">
                                            <IncremarkContent
                                                :content="msg.content"
                                                :is-finished="!msg.isStreaming"
                                                :incremark-options="{ typewriter: { enabled: msg.isStreaming } }"
                                            />
                                        </ThemeProvider>
                                    </div>
                                </template>
                                <template v-else-if="msg.isStreaming">
                                    <span class="inline-flex items-center gap-1 text-slate-400">
                                        <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400"></span>
                                        <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" style="animation-delay: 0.2s"></span>
                                        <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" style="animation-delay: 0.4s"></span>
                                    </span>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 输入区 -->
            <div class="shrink-0 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                <div class="mx-auto max-w-3xl px-4 py-3">
                    <!-- 一体外框：grid 布局,根据 isTall 切换单行/双行模板 -->
                    <div
                        class="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 transition focus-within:border-[#86A6CA] focus-within:bg-slate-50 focus-within:shadow-[0_0_0_1px_#86A6CA,0_0_12px_2px_rgba(134,166,202,0.4)] dark:border-slate-700/60 dark:bg-slate-900/80 dark:focus-within:border-[#86A6CA] dark:focus-within:bg-slate-900 dark:focus-within:shadow-[0_0_0_1px_#86A6CA,0_0_12px_2px_rgba(134,166,202,0.4)]"
                        :class="isTall ? 'ai-grid-expanded' : 'ai-grid-compact'"
                    >
                        <!-- 笔记本选择器 cell：原生 button + 绝对定位菜单 -->
                        <div ref="notebookButtonRef" class="ai-cell-notebook relative shrink-0">
                            <button
                                type="button"
                                class="flex h-[30px] items-center gap-1.5 px-2 text-sm transition active:bg-transparent"
                                :class="notebookId
                                    ? 'text-slate-700 dark:text-slate-200'
                                    : 'text-amber-700 dark:text-amber-300'"
                                @click.stop="showNotebookMenu = !showNotebookMenu"
                            >
                                <ZIcon name="ri:book-line" :size="16" />
                                <span class="max-w-[120px] truncate">
                                    {{ currentNotebookTitle || t("ai.chat.select_notebook") }}
                                </span>
                                <ZIcon
                                    name="ri:arrow-down-s-line"
                                    :size="14"
                                    :class="['transition-transform', showNotebookMenu && 'rotate-180']"
                                />
                            </button>

                            <Transition name="ai-menu">
                                <div
                                    v-if="showNotebookMenu"
                                    ref="notebookMenuRef"
                                    class="absolute bottom-full left-0 z-50 mb-1 min-w-[180px] rounded-lg border border-slate-200/80 bg-white py-1 dark:border-slate-700/60 dark:bg-slate-800"
                                >
                                    <button
                                        v-for="nb in notebooks"
                                        :key="nb.id"
                                        type="button"
                                        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                                        :class="notebookId === nb.id
                                            ? 'text-blue-600 dark:text-blue-400'
                                            : 'text-slate-700 dark:text-slate-200'"
                                        @click="handleSelectNotebook(nb.id)"
                                    >
                                        <ZIcon name="ri:book-line" :size="15" />
                                        <span class="flex-1 truncate">{{ nb.title }}</span>
                                        <ZIcon
                                            v-if="notebookId === nb.id"
                                            name="ri:check-line"
                                            :size="14"
                                            class="shrink-0"
                                        />
                                    </button>
                                </div>
                            </Transition>
                        </div>

                        <!-- textarea cell -->
                        <textarea
                            ref="textareaRef"
                            v-model="inputMessage"
                            :placeholder="t('ai.chat.input_placeholder')"
                            :disabled="!notebookId"
                            rows="1"
                            class="ai-cell-input block w-full resize-none border-0 bg-transparent px-2 py-0 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:placeholder:text-slate-500"
                            style="max-height: 88px"
                            @input="autoGrow"
                            @keydown="handleKeydown"
                        ></textarea>

                        <!-- 发送按钮 cell -->
                        <div class="ai-cell-send shrink-0">
                            <button
                                v-if="isStreaming"
                                class="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600"
                                @click="stopStreaming"
                                title="停止"
                            >
                                <ZIcon name="ri:stop-fill" :size="14" />
                            </button>
                            <button
                                v-else
                                class="flex h-[34px] w-[34px] items-center justify-center rounded-full transition"
                                :class="notebookId && inputMessage.trim()
                                    ? 'bg-[#4A6FA5] text-white shadow-[0_2px_8px_rgba(74,111,165,0.4)] hover:bg-[#3F5F95] hover:shadow-[0_4px_12px_rgba(74,111,165,0.5)] active:bg-[#345485] active:shadow-[0_1px_4px_rgba(74,111,165,0.35)] dark:shadow-[0_2px_8px_rgba(134,166,202,0.35)] dark:hover:shadow-[0_4px_12px_rgba(134,166,202,0.45)]'
                                    : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600'"
                                :disabled="!notebookId || !inputMessage.trim()"
                                @click="sendMessage"
                            >
                                <ZIcon name="ri:send-plane-fill" :size="14" />
                            </button>
                        </div>
                    </div>
                    <!-- 免责声明：更小更灰 -->
                    <p class="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                        {{ t("ai.chat.disclaimer") }}
                    </p>
                </div>
            </div>
        </div>
        </template>
    </div>
</template>

<style scoped>
/** Incremark 组件内图片自适应 */
:deep(.incremark-content img) {
    max-width: 100%;
    border-radius: 0.5rem;
}
:deep(.incremark-theme-provider) {
    height:auto;
}

/** 聊天区代码块复制按钮：与 DocView/ShareView 风格保持一致
 *  限定在 .ai-thin-scrollbar 作用域内（即消息区），避免污染其他场景
 */
:deep(.ai-thin-scrollbar .incremark-code .code-btn:hover:not(:disabled)) {
    background-color: rgba(255, 255, 255, 0.1);
}

/** 聊天区 Markdown 内容样式（与 DocNote/ShareView 一致）
 *  作用域：.ai-markdown 包裹的 Incremark 渲染内容
 *  暗色模式适配后续单独处理
 */
.ai-markdown {
    line-height: 1.75;
    color: #334155;
    overflow-wrap: break-word;
}
:deep(.ai-markdown) h1 { font-size: 1.75rem; font-weight: 700; margin-top: 2rem; margin-bottom: 0.75rem; color: #0f172a; }
:deep(.ai-markdown) h2 { font-size: 1.4rem; font-weight: 600; margin-top: 1.75rem; margin-bottom: 0.5rem; color: #1e293b; padding-bottom: 0.3rem; border-bottom: 1px solid #e2e8f0; }
:deep(.ai-markdown) h3 { font-size: 1.15rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; color: #334155; }
:deep(.ai-markdown) h4 { font-size: 1rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.5rem; color: #475569; }
:deep(.ai-markdown) p { margin-bottom: 0.75rem; }
:deep(.ai-markdown) ul, :deep(.ai-markdown) ol { margin-bottom: 0.75rem; padding-left: 1.5rem; }
:deep(.ai-markdown) ul { list-style-type: disc; }
:deep(.ai-markdown) ul ul { list-style-type: circle; }
:deep(.ai-markdown) ul ul ul { list-style-type: square; }
:deep(.ai-markdown) ol { list-style-type: decimal; }
:deep(.ai-markdown) li { margin-bottom: 0.25rem; }
:deep(.ai-markdown) a { color: #2563eb; text-decoration: underline; }
:deep(.ai-markdown) blockquote { padding-left: 1rem; margin: 1rem 0; color: #64748b; overflow-wrap: break-word; word-break: break-word; }
:deep(.ai-markdown) table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 1rem 0;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
}
:deep(.ai-markdown) th, :deep(.ai-markdown) td {
    border-bottom: 1px solid #e2e8f0;
    border-right: 1px solid #e2e8f0;
    padding: 0.5rem 0.75rem;
    text-align: left;
    background: transparent;
}
:deep(.ai-markdown) th:last-child, :deep(.ai-markdown) td:last-child { border-right: none; }
:deep(.ai-markdown) tbody tr:last-child th,
:deep(.ai-markdown) tbody tr:last-child td { border-bottom: none; }
:deep(.ai-markdown) th { background: #f8fafc; font-weight: 600; }
:deep(.ai-markdown) img { max-width: 100%; border-radius: 0.375rem; cursor: zoom-in; }

@media (max-width: 767px) {
    :deep(.ai-markdown) table {
        display: block;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
    }
    :deep(.ai-markdown) th, :deep(.ai-markdown) td { white-space: nowrap; }
}

/** AI 输入区 grid 布局
 *  - compact（≤2 行）：三列横向 [notebook | input | send]
 *  - expanded（>2 行）：两行,首行 input 占满,次行 [notebook | 留白 | send]
 *  同一组 DOM 节点,通过 grid-area 重定位,焦点不丢
 */
.ai-grid-compact {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-areas: "notebook input send";
    align-items: center;
    column-gap: 0.5rem;
}
.ai-grid-compact .ai-cell-notebook { grid-area: notebook; }
.ai-grid-compact .ai-cell-input    { grid-area: input; min-width: 0; }
.ai-grid-compact .ai-cell-send     { grid-area: send; }

.ai-grid-expanded {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
        "input input input"
        "notebook . send";
    align-items: center;
    row-gap: 0.375rem;
    column-gap: 0.5rem;
}
.ai-grid-expanded .ai-cell-notebook { grid-area: notebook; justify-self: start; }
.ai-grid-expanded .ai-cell-input    { grid-area: input; min-width: 0; }
.ai-grid-expanded .ai-cell-send     { grid-area: send; justify-self: end; }

/** textarea 高度变化时平滑过渡(配合 JS 显式设置 height) */
.ai-cell-input {
    transition: height 0.15s ease;
}

/** 细滚动条：覆盖 PC 侧栏会话列表 + 消息区
 *  6px 宽,默认半透明,hover 时加深,明暗模式分别配色
 */
.ai-thin-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(148, 163, 184, 0.4) transparent;
}
.ai-thin-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
.ai-thin-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.ai-thin-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(148, 163, 184, 0.4);
    border-radius: 3px;
}
.ai-thin-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(148, 163, 184, 0.6);
}
.dark .ai-thin-scrollbar {
    scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
}
.dark .ai-thin-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(148, 163, 184, 0.3);
}
.dark .ai-thin-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(148, 163, 184, 0.5);
}

/** 自定义笔记本菜单：淡入 + 上移 4px */
.ai-menu-enter-active,
.ai-menu-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
}
.ai-menu-enter-from,
.ai-menu-leave-to {
    opacity: 0;
    transform: translateY(4px);
}

/** 滚动到底部按钮：淡入 + 上移 8px（保留 -translate-x-1/2 居中） */
.ai-fade-enter-active,
.ai-fade-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
}
.ai-fade-enter-from,
.ai-fade-leave-to {
    opacity: 0;
    transform: translate(-50%, 8px);
}
</style>
