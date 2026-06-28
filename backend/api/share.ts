import { Context } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { randomString } from "@/utils/helper";

const { noteShares, notes } = schema;

/**
 * 创建笔记分享
 * POST /api/user/note/share/create
 * body: { note_id: number, password?: string, expires_at?: number }
 * 校验笔记归属当前用户、未被删除，生成 share_id 并写入 note_shares
 */
export const createShare = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const payload = await c.req.json();
    const { note_id, password, expires_at } = payload || {};

    // 校验 note_id 必传、类型合法
    if (!note_id || typeof note_id !== "number") {
        return c.json({ code: -1000, msg: "share.create.note_id_required", data: null });
    }

    // 单次查询：校验笔记归属当前用户 AND 未被删除
    const note = await db
        .select({ id: schema.notes.id })
        .from(schema.notes)
        .where(and(
            eq(schema.notes.id, note_id),
            eq(schema.notes.user_id, uid),
            eq(schema.notes.is_deleted, 0),
        ))
        .get();

    if (!note) {
        return c.json({ code: -1000, msg: "share.create.not_found", data: null });
    }

    // 检查用户分享数量是否达到上限（100个）
    const shareCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(noteShares)
        .where(eq(noteShares.user_id, uid))
        .get();

    if (shareCount && shareCount.count >= 100) {
        return c.json({ code: -1000, msg: "share.create.limit_reached", data: null });
    }

    // 生成分享唯一标识
    const shareId = randomString(8);

    // 插入分享记录
    const now = new Date();
    const result = await db
        .insert(schema.noteShares)
        .values({
            note_id,
            user_id: uid,
            share_id: shareId,
            password: password ?? null,
            expires_at: expires_at ? new Date(expires_at) : null,
            created_at: now,
            updated_at: now,
        })
        .returning()
        .get();

    return c.json({ code: 200, msg: "share.create.success", data: result });
};

/**
 * 获取当前用户的所有分享列表
 * GET /api/user/note/share/list
 * LEFT JOIN 笔记表，ID 倒序，最多 100 条
 * 笔记被硬删除时 title/content 兜底填充英文占位文本
 */
export const listShares = async (c: Context) => {
    const uid = Number(c.get("uid"));

    const shares = await db
        .select({
            id: noteShares.id,
            note_id: noteShares.note_id,
            share_id: noteShares.share_id,
            password: noteShares.password,
            expires_at: noteShares.expires_at,
            status: noteShares.status,
            created_at: noteShares.created_at,
            updated_at: noteShares.updated_at,
            note_title: sql<string>`IFNULL(${notes.title}, 'Deleted Note')`,
            note_content: sql<string>`IFNULL(substr(${notes.content}, 1, 50), 'This note has been deleted')`,
        })
        .from(noteShares)
        .leftJoin(notes, eq(noteShares.note_id, notes.id))
        .where(eq(noteShares.user_id, uid))
        .orderBy(desc(noteShares.id))
        .limit(100)
        .all();

    return c.json({ code: 200, msg: "share.list.success", data: shares });
};

/**
 * 获取分享的笔记内容（公开接口）
 * GET /api/share/:shareId?password=xxx
 * 校验分享状态、有效期、密码、笔记是否存在
 */
export const getShare = async (c: Context) => {
    const shareId = c.req.param("shareId") as string;
    const password = c.req.query("password");

    // 查询分享记录
    const share = await db
        .select()
        .from(noteShares)
        .where(eq(noteShares.share_id, shareId))
        .get();

    // 分享不存在
    if (!share) {
        return c.json({ code: -1000, msg: "share.get.not_found", data: null });
    }

    // 已撤销
    if (share.status !== "active") {
        return c.json({ code: -1000, msg: "share.get.not_found", data: null });
    }

    // 已过期
    if (share.expires_at && share.expires_at < new Date()) {
        return c.json({ code: -1000, msg: "share.get.not_found", data: null });
    }

    // 密码校验
    if (share.password) {
        if (!password) {
            return c.json({ code: -1000, msg: "share.get.password_required", data: null });
        }
        if (password !== share.password) {
            return c.json({ code: -1000, msg: "share.get.password_wrong", data: null });
        }
    }

    // 查询笔记：必须存在且未被删除
    const note = await db
        .select({
            title: notes.title,
            content: notes.content,
            created_at: notes.created_at,
            updated_at: notes.updated_at,
        })
        .from(notes)
        .where(and(
            eq(notes.id, share.note_id),
            eq(notes.is_deleted, 0),
        ))
        .get();

    if (!note) {
        return c.json({ code: -1000, msg: "share.get.not_found", data: null });
    }

    return c.json({ code: 200, msg: "share.get.success", data: { ...note, expires_at: share.expires_at } });
};

/**
 * 删除笔记分享
 * POST /api/user/note/share/delete
 * body: { id: number }
 * 校验分享归属当前用户，存在则物理删除
 */
export const deleteShare = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const payload = await c.req.json();
    const { id } = payload || {};

    // 校验 id 必传、类型合法
    if (!id || typeof id !== "number") {
        return c.json({ code: -1000, msg: "share.delete.id_required", data: null });
    }

    // 查询分享：校验归属当前用户
    const share = await db
        .select({ id: noteShares.id })
        .from(noteShares)
        .where(and(
            eq(noteShares.id, id),
            eq(noteShares.user_id, uid),
        ))
        .get();

    if (!share) {
        return c.json({ code: -1000, msg: "share.delete.not_found", data: null });
    }

    // 物理删除
    await db
        .delete(noteShares)
        .where(eq(noteShares.id, id))
        .run();

    return c.json({ code: 200, msg: "share.delete.success", data: null });
};