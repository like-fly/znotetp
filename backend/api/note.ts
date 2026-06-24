import { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

/**
 * 校验笔记本是否属于当前用户
 */
const checkNotebookOwnership = async (notebookId: number, userId: number) => {
    const node = await db
        .select({ id: schema.notebooks.id })
        .from(schema.notebooks)
        .where(and(
            eq(schema.notebooks.id, notebookId),
            eq(schema.notebooks.user_id, userId),
        ))
        .get();
    return !!node;
};

/**
 * 校验笔记是否属于当前用户
 */
const checkNoteOwnership = async (noteId: number, userId: number) => {
    const note = await db
        .select({ id: schema.notes.id })
        .from(schema.notes)
        .where(and(
            eq(schema.notes.id, noteId),
            eq(schema.notes.user_id, userId),
        ))
        .get();
    return !!note;
};

/**
 * 获取指定分类下的笔记列表
 * notebook_id 必传，只查未删除的笔记，按 sort_order 排序
 */
export const listNotes = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const notebookId = Number(c.req.query("notebook_id"));

    // 校验 notebook_id
    if (!notebookId || isNaN(notebookId)) {
        return c.json({
            code: -1000,
            msg: "note.list.notebook_required",
            data: null,
        });
    }

    // 校验笔记本属于当前用户
    const notebookExists = await checkNotebookOwnership(notebookId, uid);
    if (!notebookExists) {
        return c.json({
            code: -1000,
            msg: "note.list.notebook_not_found",
            data: null,
        });
    }

    const notes = await db
        .select()
        .from(schema.notes)
        .where(and(
            eq(schema.notes.user_id, uid),
            eq(schema.notes.notebook_id, notebookId),
            eq(schema.notes.is_deleted, 0),
        ))
        .orderBy(schema.notes.sort_order)
        .all();

    return c.json({
        code: 200,
        msg: "note.list.success",
        data: notes,
    });
};

/**
 * 创建笔记
 * notebook_id、title 必传；content、is_pinned、sort_order 可选
 */
export const createNote = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const payload = await c.req.json();

    const { notebook_id, title, content, is_pinned, sort_order } = payload || {};

    // 校验 notebook_id
    if (!notebook_id || typeof notebook_id !== "number") {
        return c.json({
            code: -1000,
            msg: "note.create.notebook_required",
            data: null,
        });
    }

    // 校验 title
    if (!title || typeof title !== "string" || title.trim().length === 0) {
        return c.json({
            code: -1000,
            msg: "note.create.title_required",
            data: null,
        });
    }

    // 校验笔记本属于当前用户
    const notebookExists = await checkNotebookOwnership(notebook_id, uid);
    if (!notebookExists) {
        return c.json({
            code: -1000,
            msg: "note.create.notebook_not_found",
            data: null,
        });
    }

    const now = new Date();
    const result = await db
        .insert(schema.notes)
        .values({
            user_id: uid,
            notebook_id,
            title: title.trim(),
            content: content ?? "",
            is_pinned: is_pinned ?? 0,
            sort_order: sort_order ?? 0,
            created_at: now,
            updated_at: now,
        })
        .returning()
        .get();

    return c.json({
        code: 200,
        msg: "note.create.success",
        data: result,
    });
};

/**
 * 更新笔记
 * id 必传；title、content、notebook_id、is_pinned、sort_order 可选（部分更新）
 */
export const updateNote = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const payload = await c.req.json();

    const { id, title, content, notebook_id, is_pinned, sort_order } = payload || {};

    // 校验 id
    if (!id || typeof id !== "number") {
        return c.json({
            code: -1000,
            msg: "note.update.id_required",
            data: null,
        });
    }

    // 校验笔记属于当前用户
    const noteExists = await checkNoteOwnership(id, uid);
    if (!noteExists) {
        return c.json({
            code: -1000,
            msg: "note.update.not_found",
            data: null,
        });
    }

    // 如果传了 notebook_id，校验新分类属于当前用户
    if (notebook_id !== undefined) {
        const notebookExists = await checkNotebookOwnership(notebook_id, uid);
        if (!notebookExists) {
            return c.json({
                code: -1000,
                msg: "note.update.notebook_not_found",
                data: null,
            });
        }
    }

    // 构建更新字段（部分更新）
    const updates: Record<string, any> = { updated_at: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (content !== undefined) updates.content = content;
    if (notebook_id !== undefined) updates.notebook_id = notebook_id;
    if (is_pinned !== undefined) updates.is_pinned = is_pinned;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const result = await db
        .update(schema.notes)
        .set(updates)
        .where(and(
            eq(schema.notes.id, id),
            eq(schema.notes.user_id, uid),
        ))
        .returning()
        .get();

    return c.json({
        code: 200,
        msg: "note.update.success",
        data: result,
    });
};

/**
 * 软删除笔记
 * id 必传，设置 is_deleted=1、deleted_at=now
 */
export const deleteNote = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const payload = await c.req.json();

    const { id } = payload || {};

    // 校验 id
    if (!id || typeof id !== "number") {
        return c.json({
            code: -1000,
            msg: "note.delete.id_required",
            data: null,
        });
    }

    // 校验笔记属于当前用户
    const noteExists = await checkNoteOwnership(id, uid);
    if (!noteExists) {
        return c.json({
            code: -1000,
            msg: "note.delete.not_found",
            data: null,
        });
    }

    const now = new Date();
    const result = await db
        .update(schema.notes)
        .set({
            is_deleted: 1,
            deleted_at: now,
            updated_at: now,
        })
        .where(and(
            eq(schema.notes.id, id),
            eq(schema.notes.user_id, uid),
        ))
        .returning()
        .get();

    return c.json({
        code: 200,
        msg: "note.delete.success",
        data: result,
    });
};
