# ZNote AI 功能使用文档

## 概述

ZNote 集成 AI RAG（检索增强生成）功能，通过向量化笔记内容 + AI 对话实现"与你的知识库对话"。

**技术架构**：Mastra Agent（对话编排）+ Mastra Memory（会话持久化）+ LibSQLVector（向量检索）+ SiliconFlow（Embedding + Chat）。

---

## 前置条件

### 1. 管理员配置 AI 模型

登录管理员后台，在全局设置中配置两项：

**AI 对话模型** (`ai_chat_setting`)：

```json
{
    "provider": "siliconflow",
    "base_url": "https://api.siliconflow.cn/v1",
    "model": "deepseek-ai/DeepSeek-V4-Flash",
    "api_key": "sk-xxxxxxxx"
}
```

**AI 向量模型** (`ai_embedding_setting`)：

```json
{
    "enabled": true,
    "provider": "siliconflow",
    "model": "BAAI/bge-m3",
    "api_key": "sk-xxxxxxxx"
}
```

### 2. 笔记向量化

AI 对话依赖向量检索，笔记必须先完成向量化。切到管理后台，确保 `ai_embedding_setting.enabled = true`，服务启动后每分钟自动向量化 20 篇笔记。

手动检查向量化进度：

```sql
SELECT is_vectorized, COUNT(*) FROM notes GROUP BY is_vectorized;
-- 0=待处理 1=已完成 2=跳过(超长) 3=失败
```

### 3. 笔记允许向量化

敏感笔记可将 `allow_vectorize` 设为 `0`，该笔记不会被向量化，AI 也无法检索到。

---

## 认证方式

所有 AI 接口继承 `userRouter` 的 Bearer Token 认证，请求需带：

```
Authorization: Bearer <token>
```

Token 通过 `/api/login` 接口获取。

---

## API 接口

### 会话管理

#### 列出所有会话

```
GET /api/user/ai/threads
```

响应：
```json
{
    "code": 200,
    "msg": "ai.thread.list.success",
    "data": [
        { "id": "3-f47ac10b-...", "resourceId": "3", "createdAt": "..." }
    ]
}
```

**curl 示例**：

```bash
curl -sS http://localhost:3888/api/user/ai/threads \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 查看会话消息历史

```
GET /api/user/ai/thread/:id
```

响应：
```json
{
    "code": 200,
    "msg": "ai.thread.get.success",
    "data": {
        "thread": { "id": "3-f47ac10b-...", "resourceId": "3", ... },
        "messages": [
            { "id": "...", "role": "user", "content": "Angie的配置文件在哪？" },
            { "id": "...", "role": "assistant", "content": "根据你的笔记..." }
        ]
    }
}
```

**curl 示例**：

```bash
curl -sS http://localhost:3888/api/user/ai/thread/3-f47ac10b-58cc-4372-a567-0e02b2c3d479 \
  -H "Authorization: Bearer $TOKEN"
```

---

#### 删除会话

```
DELETE /api/user/ai/thread/:id
```

> 只能删除自己的会话，跨用户访问返回错误。

**curl 示例**：

```bash
curl -sS -X DELETE http://localhost:3888/api/user/ai/thread/3-f47ac10b-... \
  -H "Authorization: Bearer $TOKEN"
```

---

### AI 对话（SSE 流式）

```
POST /api/user/ai/chat
Content-Type: application/json
```

请求体：

```json
{
    "notebook_id": 1,
    "thread_id": "aB3k9QmX7pL2sW4y",
    "message": "Angie的配置文件位于哪里？"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `notebook_id` | number | 是 | 顶层笔记本 ID（AI 只在指定笔记本内检索） |
| `thread_id` | string | 是 | 会话 ID（前端生成 16 位，字符集 `[a-zA-Z0-9_-]`） |
| `message` | string | 是 | 用户消息 |

响应：`text/event-stream`（SSE 格式）
```
data: {"type":"start","runId":"...","from":"AGENT","payload":{"id":"rag-agent","messageId":"..."}}

data: {"type":"step-start","runId":"...","from":"AGENT","payload":{"request":{"body":{"messages":[...]}}}}

data: {"type":"text-start","runId":"...","from":"AGENT","payload":{"id":"..."}}

data: {"type":"text-delta","runId":"...","from":"AGENT","payload":{"id":"...","text":"根据"}}

data: {"type":"text-delta","runId":"...","from":"AGENT","payload":{"id":"...","text":"你的"}}

data: {"type":"text-delta","runId":"...","from":"AGENT","payload":{"id":"...","text":"笔记..."}}

data: [DONE]
```

**SSE 事件类型**：

| 类型 | 说明 |
|------|------|
| `start` | 对话流开始 |
| `step-start` | 步进开始，`payload.request.body.messages` 中包含工具调用信息（`role: "assistant"` 的 `tool_calls` 和 `role: "tool"` 的结果） |
| `text-start` | 文本生成开始 |
| `text-delta` | 文本增量，内容在 `payload.text` |
| `finish` | 对话结束 |
| `error` | 异常信息 |
| `[DONE]` | 流结束标记 |

> **注意**：Mastra 的 `fullStream` 不会单独发出 `tool-call` / `tool-result` 事件。
> 工具调用信息和结果嵌入在 `step-start` 事件的 `payload.request.body.messages` 数组中。
> 前端通过解析 assistant 消息中的 `tool_calls` 和 tool 消息中的 `content` 来展示工具调用。

**curl 示例**：

```bash
# 前端生成 16 位 thread_id
THREAD_ID=$(head -c 16 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 16)

# 发送消息（SSE 流式）
curl -sS -X POST http://localhost:3888/api/user/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"notebook_id\":1,\"thread_id\":\"$THREAD_ID\",\"message\":\"Angie的配置文件位于哪里？\"}" \
  --no-buffer

# 继续对话
curl -sS -X POST http://localhost:3888/api/user/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"notebook_id\":1,\"thread_id\":\"$THREAD_ID\",\"message\":\"具体路径是什么？\"}" \
  --no-buffer
```

---

## 完整前端调用流程

```
┌─────────────────────────────────────────────────────────┐
│  1. 用户进入"AI 对话"页面                                  │
│     → GET /api/user/ai/threads                          │
│     加载历史会话列表                                        │
├─────────────────────────────────────────────────────────┤
│  2. 用户点击"新建对话"                                    │
│     → 前端生成 16 位 thread_id                             │
│       例如: crypto.randomUUID().replace(/-/g,'').slice(0,16) │
├─────────────────────────────────────────────────────────┤
│  3. 用户选择笔记本 + 输入消息                              │
│     → POST /api/user/ai/chat                            │
│       { notebook_id, thread_id, message }               │
│     → 建立 EventSource / fetch SSE                      │
│     → 逐字渲染 AI 回复                                    │
├─────────────────────────────────────────────────────────┤
│  4. 用户继续追问                                        │
│     → 复用同一 thread_id，Mastra Memory 自动注入历史上下文  │
│     → 再次 POST /api/user/ai/chat                       │
│       { notebook_id, thread_id, message }               │
├─────────────────────────────────────────────────────────┤
│  5. 用户查看历史对话                                     │
│     → GET /api/user/ai/thread/:id                       │
│     加载消息列表                                          │
├─────────────────────────────────────────────────────────┤
│  6. 用户删除对话                                        │
│     → DELETE /api/user/ai/thread/:id                    │
└─────────────────────────────────────────────────────────┘
```

### JavaScript 前端示例

```javascript
// 前端生成 16 位 thread_id
function generateThreadId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// SSE 流式对话
async function chatWithAI(notebookId, threadId, message, onDelta, onToolCall) {
  const res = await fetch('/api/user/ai/chat', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify({
      notebook_id: notebookId,
      thread_id: threadId,
      message,
    }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const seenToolCallIds = new Set();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try {
          const chunk = JSON.parse(data);
          if (chunk.type === 'step-start') {
            // 从 step-start 中提取工具调用信息
            const messages = chunk.payload?.request?.body?.messages || [];
            for (const msg of messages) {
              if (msg.role === 'assistant' && msg.tool_calls) {
                for (const tc of msg.tool_calls) {
                  if (!seenToolCallIds.has(tc.id)) {
                    seenToolCallIds.add(tc.id);
                    onToolCall(tc.id, tc.function.name, JSON.parse(tc.function.arguments));
                  }
                }
              }
            }
          } else if (chunk.type === 'text-delta' && chunk.payload?.text) {
            onDelta(chunk.payload.text);
          }
        } catch {}
      }
    }
  }
}
```

---

## 错误码

| msg | 说明 |
|-----|------|
| `ai.chat.notebook_required` | notebook_id 必填 |
| `ai.chat.thread_required` | thread_id 必填 |
| `ai.chat.thread_invalid` | thread_id 格式不合法（须 16 位 `[a-zA-Z0-9_-]`） |
| `ai.chat.message_required` | message 必填 |
| `ai.chat.notebook_not_found` | 笔记本不存在或不属于当前用户 |
| `ai.chat.thread_access_denied` | 会话不属于当前用户 |
| `ai.chat.agent_not_found` | Agent 未注册 |
| `ai.chat.error` | 对话异常 |
| `ai.thread.not_found` | 会话不存在或无权限 |
| `ai.thread.id_required` | thread id 参数缺失 |
| `ai.thread.agent_not_found` | Agent 未注册 |
| `ai.thread.memory_not_found` | Memory 未配置 |

---

## 安全机制

| 机制 | 说明 |
|------|------|
| **Bearer Token** | 所有接口通过 `userRouter` 中间件认证 |
| **notebook 归属校验** | 对话前验证笔记本属于当前用户 |
| **thread 归属校验** | 对话前验证会话属于当前用户 |
| **resourceId 绑定** | Memory 层通过 `resourceId = uid` 做租户隔离 |
| **thread_id 格式校验** | 后端强制 16 位 `[a-zA-Z0-9_-]`，非法格式直接拒绝 |
| **向量检索过滤** | 检索时通过 `notebook_id` + `user_id` 双重过滤 |
