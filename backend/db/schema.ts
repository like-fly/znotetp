import { integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ==================== 用户 & 认证 ====================

/** 用户表 */
export const users = sqliteTable("users", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
    avatar: text("avatar").default("").notNull(),
    reg_ip: text("reg_ip").notNull(),
    reg_ua: text("reg_ua").notNull(),
    status: text("status", { enum: ["active", "inactive", "banned"] }).default("active").notNull(),
    created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

/** 会话表（Token 认证） */
export const sessions = sqliteTable("sessions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uid: integer("uid").notNull(),
    role: text("role", { enum: ["user", "admin"] }).notNull(),
    token: text("token").notNull().unique(),
    ip: text("ip").notNull(),
    ua: text("ua").notNull(),
    created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    last_active_at: integer("last_active_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    expires_at: integer("expires_at", { mode: "timestamp" }).notNull(),
    status: text("status", { enum: ["active", "expired", "revoked"] }).default("active").notNull(),
});

/** 用户设置表（JSON 存储） */
export const userSettings = sqliteTable("user_settings", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    uid: integer("uid").notNull().unique(),
    value: text("value").default("{}").notNull(),
    created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

// ==================== 笔记核心 ====================

/**
 * 笔记本/分类树
 * parent_id 为 NULL → 顶层笔记本
 * parent_id 不为 NULL → 子分类
 * 笔记始终关联到叶子节点（最底层分类）
 */
export const notebooks = sqliteTable("notebooks", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id").notNull(),                                          // 所属用户
    parent_id: integer("parent_id"),                                                 // 父节点 ID，NULL 表示顶层笔记本
    title: text("title").notNull(),                                                  // 名称
    description: text("description").default("").notNull(),                          // 描述
    sort_order: integer("sort_order").default(0).notNull(),                          // 排序权重
    created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
    index("idx_notebooks_user_id").on(table.user_id),
    index("idx_notebooks_user_parent").on(table.user_id, table.parent_id),
]);

/**
 * Markdown 笔记
 * 始终关联到某个叶子分类（notebook_id）
 * 支持软删除（is_deleted / deleted_at）和置顶（is_pinned）
 */
export const notes = sqliteTable("notes", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id").notNull(),                                          // 所属用户
    notebook_id: integer("notebook_id").notNull(),                                  // 所在叶子分类
    title: text("title").notNull(),                                                  // 笔记标题
    content: text("content").default("").notNull(),                                  // Markdown 内容
    is_pinned: integer("is_pinned").default(0).notNull(),                            // 置顶 0/1
    is_deleted: integer("is_deleted").default(0).notNull(),                          // 软删除 0/1
    deleted_at: integer("deleted_at", { mode: "timestamp" }),                        // 删除时间（软删除时写入）
    sort_order: integer("sort_order").default(0).notNull(),                          // 排序权重
    created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
    index("idx_notes_user_notebook").on(table.user_id, table.notebook_id),           // 按笔记本查笔记
    index("idx_notes_user_deleted").on(table.user_id, table.is_deleted),             // 回收站查询
    index("idx_notes_user_pinned").on(table.user_id, table.is_pinned),               // 置顶笔记查询
]);

// ==================== 标签（预留） ====================

/**
 * 标签库
 * 每个用户独立的标签空间，user_id + name 唯一
 */
export const tags = sqliteTable("tags", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id").notNull(),                                          // 所属用户
    name: text("name").notNull(),                                                    // 标签名
    created_at: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
    index("idx_tags_user_id").on(table.user_id),
    uniqueIndex("idx_tags_user_name").on(table.user_id, table.name),
]);

/**
 * 笔记-标签关联（多对多）
 * 复合主键 (note_id, tag_id)，同时为 tag_id 建索引支持反查
 */
export const noteTags = sqliteTable("note_tags", {
    note_id: integer("note_id").notNull(),                                          // 笔记 ID
    tag_id: integer("tag_id").notNull(),                                            // 标签 ID
}, (table) => [
    index("idx_note_tags_tag").on(table.tag_id),                                    // 按标签查笔记
    uniqueIndex("idx_note_tags_pair").on(table.note_id, table.tag_id),              // 防重复关联
]);
