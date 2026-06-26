import { Context } from "hono";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { randomString } from "@/utils/helper";
import { getExtFromName, getExtFromMime, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE, FILES_BASE_PATH } from "@/utils/file";

/**
 * 上传图片（支持单文件或多文件）
 * POST /api/user/file/upload
 * Content-Type: multipart/form-data
 * Body: file[] (File, 可多个)
 *
 * 流程：
 * 1. 解析 formData 获取文件数组
 * 2. 逐个校验 MIME 类型 → 文件大小
 * 3. 生成 file_id → 提取扩展名 → 拼接路径
 * 4. 创建磁盘目录 → 写入文件
 * 5. 写入 files 表记录
 * 6. 返回 file_id + URL 列表
 */
export const uploadFiles = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const formData = await c.req.formData();
    const fileList = formData.getAll("file[]");

    if (!fileList || fileList.length === 0) {
        return c.json({ code: -1000, msg: "file.upload.no_file", data: null });
    }

    const results: Array<{ file_id: string; original_name: string; url: string }> = [];

    for (const item of fileList) {
        if (!(item instanceof File)) continue;

        // 校验 MIME 类型
        if (!ALLOWED_IMAGE_TYPES.includes(item.type)) {
            return c.json({ code: -1000, msg: "file.upload.invalid_type", data: null });
        }

        // 校验文件大小
        if (item.size > MAX_FILE_SIZE) {
            return c.json({ code: -1000, msg: "file.upload.too_large", data: null });
        }

        // 生成业务唯一标识（zn- 前缀便于在笔记内容中识别和提取）
        const fileId = "zn-" + randomString(8);

        // 获取扩展名：优先原始文件名，降级到 MIME 推导
        let ext = getExtFromName(item.name);
        if (!ext) ext = getExtFromMime(item.type);

        // 拼接存储路径：images/{user_id}/{YYYY}/{MM}/{file_id}.{ext}
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const relativePath = join("images", String(uid), year, month, `${fileId}.${ext}`);
        const fullPath = join(FILES_BASE_PATH, relativePath);

        // 确保目录存在
        const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        // 写入磁盘
        await Bun.write(fullPath, item);

        // 写入数据库
        await db.insert(schema.files).values({
            file_id: fileId,
            user_id: uid,
            original_name: item.name,
            file_path: relativePath,
            file_size: item.size,
            mime_type: item.type,
            created_at: now,
        }).run();

        results.push({
            file_id: fileId,
            original_name: item.name,
            url: `/files/${relativePath}`,
        });
    }

    return c.json({
        code: 200,
        msg: "file.upload.success",
        data: results,
    });
};
