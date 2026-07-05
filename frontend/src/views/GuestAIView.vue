<script setup lang="ts">
/**
 * 访客 AI 对话视图（内嵌在公开文档页面中）
 *
 * 无需登录，基于 notebook_id 进行 AI 对话。
 * thread_id 和消息历史保存在 sessionStorage 中。
 *
 * Props:
 *   - notebookId: 公开文档对应的顶层笔记本 ID
 */
import { ref, computed, nextTick, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { IncremarkContent, ThemeProvider } from "@incremark/vue";
import type { DesignTokens } from "@incremark/theme";
import "@incremark/theme/styles.css";
import ZIcon from "@/components/DynamicIcon.vue";
import { useMessage } from "naive-ui";
import { fetchAIStatus } from "@/api/ai";

const props = defineProps<{
    notebookId: number;
}>();

const { t } = useI18n();
const message = useMessage();

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

/** sessionStorage 存储的数据结构 */
interface ThreadStorage {
    thread_id: string;
    messages: ChatMessage[];
}

// ==================== sessionStorage 操作 ====================

const STORAGE_KEY = `guest-chat-${props.notebookId}`;

/** 从 sessionStorage 加载会话数据 */
const loadFromStorage = (): ThreadStorage | null => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
};

/** 保存会话数据到 sessionStorage */
const saveToStorage = () => {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            thread_id: threadId.value,
            messages: messages.value,
        }));
    } catch { /* ignore */ }
};

/** 清空 sessionStorage */
const clearStorage = () => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
};

/** 生成 16 位随机 thread_id */
const generateThreadId = (): string => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    for (let i = 0; i < 16; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
};

// ==================== 状态 ====================

const threadId = ref<string>("");
const messages = ref<ChatMessage[]>([]);
const inputMessage = ref("");
const isStreaming = ref(false);
const abortController = ref<AbortController | null>(null);

/** AI 功能启用状态：默认 true（避免首屏闪烁），请求完毕后按接口结果调整 */
const aiEnabled = ref(true);

/** textarea 自动撑高 */
const TEXTAREA_MAX_HEIGHT = 88;
const COMPACT_THRESHOLD = 60;
const isTall = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

/** 消息容器引用 */
const messageContainer = ref<HTMLElement | null>(null);

/** 是否有消息 */
const hasMessages = computed(() => messages.value.length > 0);

/** 对话轮次上限 */
const ROUND_LIMIT = 10;
/** 是否已达到对话上限 */
const hasReachedLimit = computed(() => {
    return messages.value.filter(m => m.role === "user").length >= ROUND_LIMIT;
});

// ==================== 方法 ====================

/** 检查 AI 状态 */
const checkAIStatus = async () => {
    try {
        aiEnabled.value = await fetchAIStatus();
    } catch {
        aiEnabled.value = true;
    }
};

/** 滚动到消息底部 */
const scrollToBottom = () => {
    nextTick(() => {
        if (messageContainer.value) {
            messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
        }
    });
};

/** textarea 高度自适应 */
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

/** 自动聚焦输入框 */
const focusInput = () => {
    if (textareaRef.value && !isStreaming.value) {
        textareaRef.value.focus();
    }
};

/** 监听 inputMessage 变化，程序化修改时同步高度 */
watch(inputMessage, () => {
    if (textareaRef.value) growTextarea(textareaRef.value);
});

/** 监听 threadId 切换，自动滚动 */
watch(threadId, () => {
    scrollToBottom();
});

/** 清空历史并新建对话 */
const clearAndNewThread = () => {
    clearStorage();
    threadId.value = generateThreadId();
    messages.value = [];
    nextTick(() => focusInput());
};

/** 发送消息 */
const sendMessage = async () => {
    const text = inputMessage.value.trim();
    if (!text || isStreaming.value || hasReachedLimit.value) return;

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

    // 保存到 sessionStorage
    saveToStorage();

    const controller = new AbortController();
    abortController.value = controller;

    const BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

    try {
        const response = await fetch(`${BASE_URL}/api/doc/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notebook_id: props.notebookId, thread_id: threadId.value, message: text }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            let errMsg = `HTTP ${response.status}`;
            try { errMsg = JSON.parse(body).msg || errMsg; } catch { /* ignore */ }
            messages.value[aiIndex].content = `❌ ${errMsg}`;
            messages.value[aiIndex].isStreaming = false;
            isStreaming.value = false;
            message.error(errMsg);
            saveToStorage();
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            messages.value[aiIndex].content = "❌ 无法读取响应流";
            messages.value[aiIndex].isStreaming = false;
            isStreaming.value = false;
            message.error(t("ai.error.stream_failed"));
            saveToStorage();
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

                    // 工具调用开始
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
                    // 工具调用参数完整
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
                        saveToStorage();
                        return;
                    }
                    // 错误事件
                    else if (chunk.type === "error") {
                        if (messages.value[aiIndex].content === "") {
                            messages.value[aiIndex].content = `❌ ${chunk.error || "未知错误"}`;
                        }
                        messages.value[aiIndex].isStreaming = false;
                        isStreaming.value = false;
                        saveToStorage();
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
            message.error(t("ai.error.network"));
        }
    } finally {
        messages.value[aiIndex].isStreaming = false;
        isStreaming.value = false;
        scrollToBottom();
        saveToStorage();
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
    saveToStorage();
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

// ==================== 生命周期 ====================

onMounted(async () => {
    checkAIStatus();

    // 从 sessionStorage 恢复会话
    const stored = loadFromStorage();
    if (stored && stored.thread_id) {
        threadId.value = stored.thread_id;
        messages.value = stored.messages || [];
    } else {
        threadId.value = generateThreadId();
    }

    await nextTick();
    scrollToBottom();
});
</script>

<template>
    <div class="flex h-full bg-white dark:bg-slate-950">
        <!-- AI 未启用：显示禁用提示 -->
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

        <!-- AI 启用：聊天区域 -->
        <template v-else>
            <div class="flex flex-1 flex-col min-w-0">
                <!-- 消息区 -->
                <div ref="messageContainer" class="ai-thin-scrollbar relative flex-1 overflow-y-auto">
                    <div class="mx-auto h-full max-w-3xl px-1 py-2">
                        <!-- 欢迎引导 -->
                        <div
                            v-if="!hasMessages"
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
                                {{ t("doc.chat.input_placeholder") }}
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
                    <div class="mx-auto max-w-3xl px-1 py-3">
                        <div
                            class="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 transition focus-within:border-[#86A6CA] focus-within:bg-slate-50 focus-within:shadow-[0_0_0_1px_#86A6CA,0_0_12px_2px_rgba(134,166,202,0.4)] dark:border-slate-700/60 dark:bg-slate-900/80 dark:focus-within:border-[#86A6CA] dark:focus-within:bg-slate-900 dark:focus-within:shadow-[0_0_0_1px_#86A6CA,0_0_12px_2px_rgba(134,166,202,0.4)]"
                            :class="isTall ? 'ai-grid-expanded' : 'ai-grid-compact'"
                        >
                            <!-- + 新建对话按钮 -->
                            <div class="ai-cell-notebook shrink-0">
                                <button
                                    type="button"
                                    class="flex h-[30px] w-[30px] items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
                                    title="新建对话"
                                    @click="clearAndNewThread"
                                >
                                    <ZIcon name="ri:add-line" :size="18" />
                                </button>
                            </div>

                            <!-- textarea 输入框 -->
                            <textarea
                                ref="textareaRef"
                                v-model="inputMessage"
                                :placeholder="hasReachedLimit ? t('doc.chat.limit_reached') : t('doc.chat.input_placeholder')"
                                :disabled="hasReachedLimit"
                                rows="1"
                                class="ai-cell-input block w-full resize-none border-0 bg-transparent px-2 py-0 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-200 dark:placeholder:text-slate-500"
                                style="max-height: 88px"
                                @input="autoGrow"
                                @keydown="handleKeydown"
                            ></textarea>

                            <!-- 发送/停止按钮 -->
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
                                    :class="inputMessage.trim()
                                        ? 'bg-[#4A6FA5] text-white shadow-[0_2px_8px_rgba(74,111,165,0.4)] hover:bg-[#3F5F95] hover:shadow-[0_4px_12px_rgba(74,111,165,0.5)] active:bg-[#345485] active:shadow-[0_1px_4px_rgba(74,111,165,0.35)] dark:shadow-[0_2px_8px_rgba(134,166,202,0.35)] dark:hover:shadow-[0_4px_12px_rgba(134,166,202,0.45)]'
                                        : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600'"
                                    :disabled="!inputMessage.trim() || hasReachedLimit"
                                    @click="sendMessage"
                                >
                                    <ZIcon name="ri:send-plane-fill" :size="14" />
                                </button>
                            </div>
                        </div>
                        <!-- 对话上限提示 -->
                        <p v-if="hasReachedLimit" class="mt-1.5 text-center text-[11px] text-amber-500 dark:text-amber-400">
                            {{ t("doc.chat.limit_hint") }}
                        </p>
                        <!-- 免责声明 -->
                        <p class="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                            {{ t("doc.chat.disclaimer") }}
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
    height: auto;
}

/** 聊天区代码块复制按钮 */
:deep(.ai-thin-scrollbar .incremark-code .code-btn:hover:not(:disabled)) {
    background-color: rgba(255, 255, 255, 0.1);
}

/** 聊天区 Markdown 内容样式 */
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

/** AI 输入区 grid 布局 */
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

/** textarea 高度变化时平滑过渡 */
.ai-cell-input {
    transition: height 0.15s ease;
}

/** 细滚动条 */
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
</style>
