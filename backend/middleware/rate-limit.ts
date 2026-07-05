import { rateLimiter } from "hono-rate-limiter";
import { getClientIp } from "@/utils/helper";

/** 访客 AI 对话频率限制：每天最多 30 次 */
export const docChatRateLimiter = rateLimiter({
    windowMs: 24 * 60 * 60 * 1000,
    limit: 30,
    keyGenerator: (c) => getClientIp(c),
    standardHeaders: true,
    handler: (c) =>
        c.json({ code: -1000, msg: "doc.chat.rate_limited", data: null }, 200),
});
