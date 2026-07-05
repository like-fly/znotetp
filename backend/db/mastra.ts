import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { createOpenAI } from "@ai-sdk/openai";
import { createTool } from "@mastra/core/tools";
import { embedMany } from "ai";
import { z } from "zod";
import { dirname } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { vectorStore, INDEX_NAME } from "@/db/vector";
import { getBaseURL, getAIChatConfig, getAIEmbeddingConfig, VECTOR_DIMENSIONS } from "@/utils/ai-config";
import { CHAT_MEMORY_DB } from "@/path";

// 确保目录存在
const dir = dirname(CHAT_MEMORY_DB);
if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
}

// 从数据库加载对话模型配置
const chatConfig = await getAIChatConfig();
const chatOpenAI = createOpenAI({
    baseURL: chatConfig?.provider ? getBaseURL(chatConfig.provider) : "https://api.siliconflow.cn/v1",
    apiKey: chatConfig?.api_key || "",
    fetch: Object.assign(
        async (input: URL | RequestInfo, init?: RequestInit | BunFetchRequestInit) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120_000);
            try {
                init = init || {};
                const origSignal = init.signal;
                if (origSignal) {
                    origSignal.addEventListener("abort", () => controller.abort(), { once: true });
                }
                init.signal = controller.signal;
                return await fetch(input, init);
            } finally {
                clearTimeout(timeoutId);
            }
        },
        { preconnect: () => {} }
    ),

});
const chatModel = chatOpenAI.chat(chatConfig?.model || "deepseek-ai/DeepSeek-V4-Flash");

/** RAG 检索工具：搜索笔记向量库，返回相关内容 */
const searchNotesTool = createTool({
    id: "search-notes",
    description: "搜索用户的笔记内容以获取与问题相关的信息，返回匹配的笔记原文供参考回答",
    inputSchema: z.object({
        query: z.string().describe("要在笔记中搜索的关键词或问题"),
    }),
    execute: async ({ query }, { requestContext }) => {
        const notebookId = requestContext?.get("notebook_id") as number | undefined;
        const userId = requestContext?.get("user_id") as number | undefined;

        if (!notebookId || !userId) {
            return { context: "搜索上下文缺失，请联系管理员。", sources: [] };
        }

        // 获取 embedding 配置
        const embConfig = await getAIEmbeddingConfig();
        if (!embConfig?.enabled) {
            return { context: "向量化功能未开启，无法检索笔记。", sources: [] };
        }

        const embProvider = createOpenAI({
            baseURL: getBaseURL(embConfig.provider),
            apiKey: embConfig.api_key,
        });

        const isBgeModel = embConfig.model?.toLowerCase().includes("bge");
        const { embeddings } = await embedMany({
            model: embProvider.embedding(embConfig.model),
            values: [query],
            providerOptions: isBgeModel
                ? undefined
                : { openai: { dimensions: VECTOR_DIMENSIONS } },
        });

        // 向量检索
        const results = await vectorStore.query({
            indexName: INDEX_NAME,
            queryVector: embeddings[0],
            topK: 5,
            filter: { notebook_id: notebookId, user_id: userId },
        });

        if (results.length === 0) {
            return { context: "没有找到相关的笔记内容。", sources: [] };
        }

        // 批量查询笔记原文
        const noteIds = [...new Set(results.filter(r => r.metadata).map(r => r.metadata!.note_id as number))];
        const notes = await db
            .select({ id: schema.notes.id, title: schema.notes.title, content: schema.notes.content })
            .from(schema.notes)
            .where(inArray(schema.notes.id, noteIds));

        const noteMap = new Map(notes.map(n => [n.id, n]));
        const context = results
            .map(r => {
                const note = noteMap.get(r.metadata?.note_id as number);
                return note ? `--- 笔记: ${note.title} ---\n${note.content}` : "";
            })
            .filter(Boolean)
            .join("\n\n");

        const sources = notes.map(n => ({ id: n.id, title: n.title }));

        return { context, sources };
    },
});

/** 内存实例（对话历史持久化） */
const memory = new Memory({
    storage: new LibSQLStore({
        id: "mastra-memory",
        url: `file:${CHAT_MEMORY_DB}`,
    }),
    options: {
        lastMessages: 20,
        generateTitle: true,
    },
});

/** 笔记 RAG 对话 Agent */
export const ragAgent = new Agent({
    id: "rag-agent",
    name: "笔记助手",
    instructions: `你是用户的私人笔记AI助手，帮助用户检索和回答基于他们笔记内容的问题。

你可以使用 search-notes 工具搜索用户的笔记知识库，工具会返回最相关的笔记全文。

## 何时调用 search-notes 工具

在执行任何操作之前，根据用户的输入和对话上下文，判断用户意图：

**需要调用工具**：
- 用户提问涉及具体知识、技术、项目、方案、教程等问题
- 用户询问"xxx 是什么"、"xxx 怎么做"、"xxx 配置在哪"等需要查资料的问题
- 用户提到笔记中的某个主题，希望获取详情

**不需要调用工具，直接回答**：
- 打招呼（如"你好"、"嗨"、"早上好"）
- 致谢（如"谢谢"、"感谢"）
- 询问你的能力或功能（如"你能做什么"、"怎么用"）

**不需要调用工具，但需礼貌拒绝**：
- 与笔记内容完全无关的问题（如天气、新闻、闲聊八卦等）
- 此时应告知用户：你是笔记助手，只能回答基于笔记内容的问题

## 回答规则

1. 基于检索到的笔记内容回答，不要编造信息
2. 如果笔记中没有相关信息，如实告知用户
3. 回答时引用笔记标题（例如：根据《项目规划》笔记...）
4. 保持回答简洁有条理`,
    model: chatModel,
    tools: { "search-notes": searchNotesTool },
    memory,
});

/** Mastra 实例 */
export const mastra = new Mastra({
    storage: new LibSQLStore({
        id: "mastra-storage",
        url: `file:${CHAT_MEMORY_DB}`,
        // 数据保留策略：90 天后自动过滤旧数据
        retention: {
            memory: {
                threads: { maxAge: '90d' },
                messages: { maxAge: '90d' },
            },
        },
    }),
    agents: { ragAgent },
});

/** 清理过期数据（调用 storage.prune()） */
export async function pruneExpiredData() {
    const storage = mastra.getStorage();
    if (!storage) return;

    const results = await storage.prune({ maxRows: 100_000, pauseMs: 25 });
    for (const r of results) {
        if (r.deleted > 0) {
            console.log(`[Retention] ${r.domain}.${r.table}: deleted ${r.deleted}, done=${r.done}`);
        }
    }
    return results;
}
