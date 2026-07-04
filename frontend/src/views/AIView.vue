<script setup lang="ts">
/**
 * AI 对话视图
 *
 * 左右分栏：左侧会话列表，右侧聊天区域。
 * SSE 流式对话，支持多轮对话和会话管理。
 * 移动端左侧栏以抽屉形式展示。
 */
import { ref, computed, nextTick, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { NSelect, NDrawer, NDrawerContent, NButton, NSpin } from "naive-ui";
import { marked } from "marked";
import ZIcon from "@/components/DynamicIcon.vue";
import { fetchTopNotebooks } from "@/api/notebook";
import { fetchThreads, fetchThreadDetail, deleteThread } from "@/api/ai";
import type { Notebook } from "@/types/note";

const { t } = useI18n();

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

/** 滚动到消息底部 */
const messageContainer = ref<HTMLElement | null>(null);
const scrollToBottom = () => {
    nextTick(() => {
        if (messageContainer.value) {
            messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
        }
    });
};

/** 笔记本下拉选项 */
const notebookOptions = computed(() =>
    notebooks.value.map((nb) => ({ label: `📔 ${nb.title}`, value: nb.id })),
);

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

/** 渲染 Markdown 为 HTML */
const renderMarkdown = (content: string): string => {
    if (!content) return "";
    return marked.parse(content) as string;
};

/** 监听线程切换，自动滚动 */
watch(selectedThreadId, () => {
    scrollToBottom();
});

onMounted(async () => {
    await Promise.all([loadThreads(), loadNotebooks()]);
});
</script>

<template>
    <div class="flex h-[100dvh] bg-white dark:bg-slate-950">
        <!-- ====== PC 端左侧栏 ====== -->
        <aside
            class="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50 md:flex dark:border-slate-800 dark:bg-slate-900"
        >
            <!-- 新对话按钮 -->
            <div class="p-3">
                <NButton type="primary" block @click="startNewThread" :bordered="false">
                    <template #icon>
                        <ZIcon name="ri:add-line" :size="18" />
                    </template>
                    {{ t("ai.chat.new_thread") }}
                </NButton>
            </div>

            <!-- 会话列表 -->
            <div class="flex-1 overflow-y-auto px-2 pb-2">
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
                    <NButton type="primary" block @click="startNewThread" :bordered="false" class="mb-3">
                        <template #icon>
                            <ZIcon name="ri:add-line" :size="18" />
                        </template>
                        {{ t("ai.chat.new_thread") }}
                    </NButton>
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
            <!-- 顶栏 -->
            <header
                class="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-3 dark:border-slate-800"
            >
                <!-- 移动端菜单按钮 -->
                <button
                    class="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800"
                    @click="isSidebarOpen = true"
                >
                    <ZIcon name="ri:menu-line" :size="22" />
                </button>

                <!-- 笔记本选择器 -->
                <div class="w-56 shrink-0">
                    <NSelect
                        v-model:value="notebookId"
                        :options="notebookOptions"
                        :placeholder="t('ai.chat.select_notebook')"
                        size="small"
                        clearable
                    />
                </div>

                <!-- 会话标题 -->
                <span class="truncate text-sm text-slate-500 dark:text-slate-400">
                    {{ currentThread ? getThreadTitle(currentThread) : t("ai.chat.title") }}
                </span>
            </header>

            <!-- 消息区 -->
            <div ref="messageContainer" class="flex-1 overflow-y-auto">
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
                        <div class="mb-4 text-5xl">🤖</div>
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
                                class="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-200"
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
                                        <div v-if="tool._expanded" class="mt-1 rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">
                                            <!-- 输入参数 -->
                                            <div v-if="tool.input || tool.inputText" class="mb-2">
                                                <div class="mb-1 font-medium text-slate-500">{{ t('ai.tool.input') }}</div>
                                                <pre class="overflow-x-auto whitespace-pre-wrap text-slate-600 dark:text-slate-400">{{ tool.input ? JSON.stringify(tool.input, null, 2) : tool.inputText }}</pre>
                                            </div>
                                            <!-- 执行结果 -->
                                            <div v-if="tool.result">
                                                <div class="mb-1 font-medium text-slate-500">{{ t('ai.tool.result') }}</div>
                                                <!-- 标准格式：{ context, sources } → context 用 markdown 渲染 -->
                                                <template v-if="tool.result.context">
                                                    <div
                                                        class="markdown-body max-h-96 overflow-auto text-xs leading-relaxed"
                                                        v-html="renderMarkdown(tool.result.context)"
                                                    ></div>
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

                                <!-- 消息内容（marked.js 实时渲染） -->
                                <template v-if="msg.content">
                                    <div
                                        class="markdown-body prose prose-sm max-w-none break-words text-sm leading-relaxed"
                                        :class="[
                                            'prose-headings:text-slate-800 dark:prose-headings:text-slate-200',
                                            'prose-p:text-slate-800 dark:prose-p:text-slate-200',
                                            'prose-li:text-slate-800 dark:prose-li:text-slate-200',
                                            'prose-a:text-blue-500',
                                            'prose-code:before:content-none prose-code:after:content-none',
                                            'prose-code:rounded prose-code:bg-slate-200 prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-rose-600',
                                            'dark:prose-code:bg-slate-700 dark:prose-code:text-rose-400',
                                        ]"
                                        v-html="renderMarkdown(msg.content)"
                                    ></div>
                                    <!-- 打字机光标 -->
                                    <span
                                        v-if="msg.isStreaming"
                                        class="ml-0.5 inline-block h-[1.1em] w-[2px] animate-pulse rounded-sm bg-blue-500 align-text-bottom"
                                    ></span>
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
                    <div class="flex items-end gap-2">
                        <textarea
                            v-model="inputMessage"
                            :placeholder="t('ai.chat.input_placeholder')"
                            :disabled="!notebookId || !selectedThreadId"
                            rows="1"
                            class="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-500"
                            @input="(e) => {
                                const el = e.target as HTMLTextAreaElement;
                                el.style.height = 'auto';
                                el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                            }"
                            @keydown="handleKeydown"
                        ></textarea>
                        <button
                            v-if="isStreaming"
                            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white transition hover:bg-red-600"
                            @click="stopStreaming"
                            title="停止"
                        >
                            <ZIcon name="ri:stop-fill" :size="18" />
                        </button>
                        <button
                            v-else
                            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition"
                            :class="notebookId && selectedThreadId && inputMessage.trim()
                                ? 'bg-blue-500 text-white hover:bg-blue-600'
                                : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600'"
                            :disabled="!notebookId || !selectedThreadId || !inputMessage.trim()"
                            @click="sendMessage"
                        >
                            <ZIcon name="ri:send-plane-fill" :size="18" />
                        </button>
                    </div>
                    <p class="mt-1.5 text-center text-xs text-slate-400 dark:text-slate-600">
                        {{ t("ai.chat.disclaimer") }}
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/** 图片自适应 */
.markdown-body img {
    max-width: 100%;
    border-radius: 0.5rem;
    margin: 0.5rem 0;
}

/** 代码块样式 */
.markdown-body :deep(pre) {
    background-color: #1e293b;
    border-radius: 0.5rem;
    padding: 1rem;
    margin: 0.75rem 0;
    overflow-x: auto;
}

.markdown-body :deep(pre code) {
    background: transparent;
    color: #e2e8f0;
    padding: 0;
    font-size: 0.8125rem;
    line-height: 1.6;
    font-family: "Menlo", "Consolas", monospace;
}

/** 表格样式 */
.markdown-body :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0;
    font-size: 0.8125rem;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
    border: 1px solid #cbd5e1;
    padding: 0.5rem 0.75rem;
    text-align: left;
}

.markdown-body :deep(th) {
    background-color: #f1f5f9;
    font-weight: 600;
}

/** 引用块 */
.markdown-body :deep(blockquote) {
    border-left: 3px solid #3b82f6;
    padding-left: 1rem;
    margin: 0.5rem 0;
    color: #64748b;
}

/** 分隔线 */
.markdown-body :deep(hr) {
    border-color: #e2e8f0;
    margin: 1rem 0;
}
</style>
