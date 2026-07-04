import { getSettingValue } from "@/api/setting";

/** 单篇内容最大字符数，超过则跳过（BAAI/bge-m3 上限约 8192 tokens，留余量） */
export const MAX_CONTENT_LENGTH = 5000;

/** 向量维度 */
export const VECTOR_DIMENSIONS = 1024;

/** 根据 AI provider 返回对应的 API 地址 */
export function getBaseURL(provider: string): string {
    switch (provider) {
        case "siliconflow":
            return "https://api.siliconflow.cn/v1";
        default:
            return "https://api.siliconflow.cn/v1";
    }
}

/** 获取 AI 对话模型配置 */
export async function getAIChatConfig() {
    return getSettingValue("ai_chat_setting");
}

/** 获取 AI 向量模型配置 */
export async function getAIEmbeddingConfig() {
    return getSettingValue("ai_embedding_setting");
}
