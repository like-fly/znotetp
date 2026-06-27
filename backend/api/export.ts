import { Context } from "hono";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { checkNotebookOwnership } from "@/utils/ownership";
import { randomString } from "@/utils/helper";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { eq, and, inArray } from "drizzle-orm";
import AdmZip from "adm-zip";

/** 笔记本信息缓存 */
interface NotebookInfo {
    id: number;
    parent_id: number | null;
    title: string;
}

/**
 * 清理文件名中的特殊字符
 * / \ : * ? " < > | → 替换为 _
 */
function sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, "_");
}

/**
 * 截断文件名，确保不超过最大字节数
 * 按字符截断，避免截断 UTF-8 多字节字符
 */
function truncateFilename(name: string, maxLength: number = 200): string {
    if (name.length <= maxLength) return name;
    return name.slice(0, maxLength);
}

/**
 * 递归获取所有子分类 ID
 */
async function getAllChildNotebookIds(parentId: number): Promise<number[]> {
    const children = await db
        .select({ id: schema.notebooks.id })
        .from(schema.notebooks)
        .where(eq(schema.notebooks.parent_id, parentId));

    let ids = children.map((c) => c.id);
    for (const child of children) {
        const childIds = await getAllChildNotebookIds(child.id);
        ids = ids.concat(childIds);
    }
    return ids;
}

/**
 * 构建笔记本的完整路径（从根到当前节点）
 */
function buildNotebookPath(
    notebookId: number,
    notebookMap: Map<number, NotebookInfo>,
): string {
    const nb = notebookMap.get(notebookId);
    if (!nb) return "";
    if (!nb.parent_id || !notebookMap.has(nb.parent_id)) {
        return sanitizeFilename(nb.title);
    }
    const parentPath = buildNotebookPath(nb.parent_id, notebookMap);
    return join(parentPath, sanitizeFilename(nb.title));
}

/**
 * 笔记本导出接口
 * GET /api/user/export?notebook_id=xxx
 *
 * 流程：
 * 1. 校验 notebook_id 归属
 * 2. 递归查询所有子分类
 * 3. 查询所有正常笔记（is_deleted = 0）
 * 4. 创建临时目录结构
 * 5. 打包 ZIP 返回
 * 6. 清理临时目录
 */
export const exportZip = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const notebookId = Number(c.req.query("notebook_id"));

    // 参数校验
    if (!notebookId || isNaN(notebookId)) {
        return c.json({ code: -1000, msg: "export.notebook_required", data: null });
    }

    // 归属校验
    const owned = await checkNotebookOwnership(notebookId, uid);
    if (!owned) {
        return c.json({ code: -1000, msg: "export.notebook_not_found", data: null });
    }

    // 获取根笔记本信息
    const rootNotebook = await db
        .select()
        .from(schema.notebooks)
        .where(eq(schema.notebooks.id, notebookId))
        .get();

    if (!rootNotebook) {
        return c.json({ code: -1000, msg: "export.notebook_not_found", data: null });
    }

    // 递归获取所有子分类 ID（含根节点）
    const allNotebookIds = [notebookId, ...(await getAllChildNotebookIds(notebookId))];

    // 查询所有正常笔记
    const notes = await db
        .select({
            id: schema.notes.id,
            notebook_id: schema.notes.notebook_id,
            title: schema.notes.title,
            content: schema.notes.content,
            created_at: schema.notes.created_at,
            updated_at: schema.notes.updated_at,
        })
        .from(schema.notes)
        .where(
            and(
                inArray(schema.notes.notebook_id, allNotebookIds),
                eq(schema.notes.is_deleted, 0),
            ),
        );

    // 空笔记本报错
    if (notes.length === 0) {
        return c.json({ code: -1000, msg: "export.no_notes", data: null });
    }

    // 超过 1000 条限制
    if (notes.length > 1000) {
        return c.json({ code: -1000, msg: "export.too_many_notes", data: null });
    }

    // 查询所有相关笔记本信息
    const allNotebooks = await db
        .select({
            id: schema.notebooks.id,
            parent_id: schema.notebooks.parent_id,
            title: schema.notebooks.title,
        })
        .from(schema.notebooks)
        .where(inArray(schema.notebooks.id, allNotebookIds));

    const notebookMap = new Map<number, NotebookInfo>(
        allNotebooks.map((nb) => [nb.id, nb]),
    );

    // 创建临时目录
    const tmpDir = join("/tmp", `zest_export_${uid}_${Date.now()}`);
    const rootDir = join(tmpDir, sanitizeFilename(rootNotebook.title));
    mkdirSync(rootDir, { recursive: true });

    try {
        // 记录已创建的文件名，用于处理同名
        const createdFiles = new Map<string, number>();

        for (const note of notes) {
            // 构建笔记本路径
            const notebookPath = buildNotebookPath(note.notebook_id, notebookMap);
            const fullDirPath = join(tmpDir, notebookPath);

            // 确保目录存在
            mkdirSync(fullDirPath, { recursive: true });

            // 处理文件名：清理特殊字符 + 截断
            let baseName = truncateFilename(sanitizeFilename(note.title));
            let fileName = `${baseName}.md`;
            let filePath = join(fullDirPath, fileName);

            // 处理同名文件：追加随机后缀
            if (createdFiles.has(filePath)) {
                fileName = `${baseName}_${randomString(3)}.md`;
                filePath = join(fullDirPath, fileName);
            }
            createdFiles.set(filePath, 1);

            // 写入笔记内容
            writeFileSync(filePath, note.content, "utf-8");

            // 设置文件时间：ctime 使用创建时间，mtime 使用修改时间
            const createdAt = new Date(note.created_at);
            const updatedAt = new Date(note.updated_at);
            utimesSync(filePath, createdAt, updatedAt);
        }

        // 打包 ZIP
        const zip = new AdmZip();
        zip.addLocalFolder(tmpDir);
        const zipBuffer = zip.toBuffer();

        // 设置响应头
        c.header("Content-Type", "application/zip");
        c.header(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(rootNotebook.title)}.zip`,
        );

        return c.body(zipBuffer);
    } finally {
        // 清理临时目录
        try {
            rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            /* 忽略清理错误 */
        }
    }
};
