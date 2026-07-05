/**
 * AI 对话框口 API 封装层
 *
 * 与后端 routers.ts 中的 userRouter.ai.* 路由一一对应。
 * SSE 流式对话使用原生 fetch（axio 不支持 ReadableStream）。
 */
import req from "@/utils/req";

/** 统一接口返回结构 */
interface ApiResult<T> {
    code: number;
    msg: string;
    data: T;
}

/** 会话线程 */
export interface AIThread {
    id: string;
    resourceId: string;
    createdAt: string;
    updatedAt?: string;
    title?: string;
}

/** 会话消息 */
export interface AIThreadMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
}

/** 会话详情（含消息列表） */
export interface AIThreadDetail {
    thread: AIThread;
    messages: AIThreadMessage[];
}

/**
 * 获取当前用户的 AI 对话会话列表
 */
export const fetchThreads = async (): Promise<AIThread[]> => {
    const res = await req.get<ApiResult<AIThread[]>>("/api/user/ai/threads");
    if (res.data?.code === 200) {
        return res.data.data ?? [];
    }
    return [];
};

/**
 * 获取指定会话详情（含消息历史）
 */
export const fetchThreadDetail = async (threadId: string): Promise<AIThreadDetail | null> => {
    const res = await req.get<ApiResult<AIThreadDetail>>(`/api/user/ai/thread/${threadId}`);
    if (res.data?.code === 200) {
        return res.data.data;
    }
    return null;
};

/**
 * 删除指定会话
 */
export const deleteThread = async (threadId: string): Promise<boolean> => {
    const res = await req.delete<ApiResult<null>>(`/api/user/ai/thread/${threadId}`);
    return res.data?.code === 200;
};

/**
 * 检查 AI 功能是否已启用（公开接口，无需认证）
 * GET /api/ai/status
 * @returns boolean - true 表示已启用
 *  失败时默认 true（静默降级，不阻塞用户使用）
 */
export const fetchAIStatus = async (): Promise<boolean> => {
    const res = await req.get<ApiResult<{ enabled: boolean }>>("/api/ai/status");
    if (res.data?.code === 200) {
        return !!res.data.data?.enabled;
    }
    return true;
};
