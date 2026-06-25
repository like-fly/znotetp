import { Context } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { checkNoteOwnership } from "@/utils/ownership";

/**
 * 获取笔记的历史版本列表
 * note_id 必传，仅返回轻量字段（不含 content，列表点击后再加载详情）
 * 按 version_no 降序，最多 50 条
 *
 * 说明：不过滤笔记软删除状态，回收站中的笔记仍可查看历史
 */
export const listNoteVersions = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const noteId = Number(c.req.query("note_id"));

    // 校验 note_id
    if (!noteId || isNaN(noteId)) {
        return c.json({
            code: -1000,
            msg: "note.versions.list.note_id_required",
            data: null,
        });
    }

    // 校验笔记属于当前用户（不过滤软删除，回收站笔记仍可查历史）
    const noteExists = await checkNoteOwnership(noteId, uid);
    if (!noteExists) {
        return c.json({
            code: -1000,
            msg: "note.versions.list.note_not_found",
            data: null,
        });
    }

    // 仅取轻量字段，按版本号倒序，最多 50 条（与历史保留上限一致）
    const versions = await db
        .select({
            id: schema.noteVersions.id,
            version_no: schema.noteVersions.version_no,
            created_at: schema.noteVersions.created_at,
        })
        .from(schema.noteVersions)
        .where(and(
            eq(schema.noteVersions.note_id, noteId),
            eq(schema.noteVersions.user_id, uid),
        ))
        .orderBy(desc(schema.noteVersions.version_no))
        .limit(50)
        .all();

    return c.json({
        code: 200,
        msg: "note.versions.list.success",
        data: versions,
    });
};

/**
 * 获取单个历史版本详情（含 title/content）
 * version_id 必传，通过 note_versions.id + user_id 校验归属
 */
export const getNoteVersion = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const versionId = Number(c.req.query("version_id"));

    // 校验 version_id
    if (!versionId || isNaN(versionId)) {
        return c.json({
            code: -1000,
            msg: "note.versions.detail.version_id_required",
            data: null,
        });
    }

    // 直接查 note_versions，user_id 条件防越权
    const version = await db
        .select({
            id: schema.noteVersions.id,
            note_id: schema.noteVersions.note_id,
            title: schema.noteVersions.title,
            content: schema.noteVersions.content,
            version_no: schema.noteVersions.version_no,
            created_at: schema.noteVersions.created_at,
        })
        .from(schema.noteVersions)
        .where(and(
            eq(schema.noteVersions.id, versionId),
            eq(schema.noteVersions.user_id, uid),
        ))
        .get();

    if (!version) {
        return c.json({
            code: -1000,
            msg: "note.versions.detail.not_found",
            data: null,
        });
    }

    return c.json({
        code: 200,
        msg: "note.versions.detail.success",
        data: version,
    });
};
