import { Context } from "hono";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

/** 扁平笔记本节点类型（Drizzle 推断） */
type NotebookFlat = typeof schema.notebooks.$inferSelect;

/** 树形笔记本节点（在扁平节点基础上加 children，递归嵌套） */
type NotebookTreeNode = NotebookFlat & {
    children: NotebookTreeNode[];
};

/**
 * 把扁平笔记本列表组装成树形结构（O(n) 单次遍历）
 * - 顶层为 parent_id 为 null 的节点
 * - 用 Map 做 O(1) 查找，children 保持 sort_order 相对顺序
 * @param flatList 已按 sort_order 升序排序的扁平列表
 */
const buildNotebookTree = (flatList: NotebookFlat[]): NotebookTreeNode[] => {
    const nodeMap = new Map<number, NotebookTreeNode>();
    const roots: NotebookTreeNode[] = [];

    // 第一遍：预创建所有节点
    for (const node of flatList) {
        nodeMap.set(node.id, { ...node, children: [] });
    }

    // 第二遍：挂载到父节点
    for (const node of flatList) {
        const treeNode = nodeMap.get(node.id)!;
        if (node.parent_id === null) {
            roots.push(treeNode);
        } else {
            const parent = nodeMap.get(node.parent_id);
            if (parent) {
                parent.children.push(treeNode);
            }
        }
    }

    return roots;
};

/**
 * 校验节点是否属于当前用户
 */
const checkNodeOwnership = async (nodeId: number, userId: number) => {
    const node = await db
        .select({ id: schema.notebooks.id })
        .from(schema.notebooks)
        .where(and(
            eq(schema.notebooks.id, nodeId),
            eq(schema.notebooks.user_id, userId),
        ))
        .get();
    return !!node;
};

/**
 * 检查是否会产生循环引用
 * 从 newParentId 向上遍历到根节点，如果遇到 nodeId 则说明会循环
 */
const wouldCreateCycle = async (nodeId: number, newParentId: number) => {
    let currentId: number | null = newParentId;
    while (currentId !== null) {
        if (currentId === nodeId) return true;
        const node = await db
            .select({ parent_id: schema.notebooks.parent_id })
            .from(schema.notebooks)
            .where(eq(schema.notebooks.id, currentId))
            .get();
        if (!node) return false;
        currentId = node.parent_id;
    }
    return false;
};

/**
 * 获取用户的笔记本列表（树形结构）
 * 一次 SQL 查全量扁平数据（按 sort_order 升序），后端递归组装成树返回
 * 顶层节点为 parent_id 为 null 的节点，每个节点含 children 数组（递归嵌套）
 */
export const listNotebooks = async (c: Context) => {
    const uid = Number(c.get("uid"));

    const notebooks = await db
        .select()
        .from(schema.notebooks)
        .where(eq(schema.notebooks.user_id, uid))
        .orderBy(schema.notebooks.sort_order)
        .all();

    // 后端组装树形结构，避免前端自行递归
    const tree = buildNotebookTree(notebooks);

    return c.json({
        code: 200,
        msg: "notebook.list.success",
        data: tree,
    });
};

/**
 * 获取用户的顶层笔记本（parent_id 为 NULL，按 sort_order 排序）
 */
export const getTopLevelNotebooks = async (c: Context) => {
    const uid = Number(c.get("uid"));

    const notebooks = await db
        .select()
        .from(schema.notebooks)
        .where(and(
            eq(schema.notebooks.user_id, uid),
            isNull(schema.notebooks.parent_id),
        ))
        .orderBy(schema.notebooks.sort_order)
        .all();

    return c.json({
        code: 200,
        msg: "notebook.top.success",
        data: notebooks,
    });
};

/**
 * 创建笔记本/分类
 * parent_id 为空 → 顶层笔记本
 * parent_id 不为空 → 子分类
 */
export const createNotebook = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const payload = await c.req.json();

    const { title, parent_id, description, sort_order } = payload || {};

    // 校验 title 非空
    if (!title || typeof title !== "string" || title.trim().length === 0) {
        return c.json({
            code: -1000,
            msg: "notebook.create.title_required",
            data: null,
        });
    }

    // 若传了 parent_id，校验属于当前用户
    const parentId = parent_id ?? null;
    if (parentId !== null) {
        const exists = await checkNodeOwnership(parentId, uid);
        if (!exists) {
            return c.json({
                code: -1000,
                msg: "notebook.create.parent_not_found",
                data: null,
            });
        }
    }

    const now = new Date();
    const result = await db
        .insert(schema.notebooks)
        .values({
            user_id: uid,
            parent_id: parentId,
            title: title.trim(),
            description: description ?? "",
            sort_order: sort_order ?? 0,
            created_at: now,
            updated_at: now,
        })
        .returning()
        .get();

    return c.json({
        code: 200,
        msg: "notebook.create.success",
        data: result,
    });
};

/**
 * 更新笔记本/分类
 * 支持部分更新：title, description, sort_order, parent_id（移动节点）
 */
export const updateNotebook = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const payload = await c.req.json();

    const { id, title, description, sort_order, parent_id } = payload || {};

    // 校验 id
    if (!id || typeof id !== "number") {
        return c.json({
            code: -1000,
            msg: "notebook.update.id_required",
            data: null,
        });
    }

    // 校验节点属于当前用户
    const node = await db
        .select()
        .from(schema.notebooks)
        .where(and(
            eq(schema.notebooks.id, id),
            eq(schema.notebooks.user_id, uid),
        ))
        .get();

    if (!node) {
        return c.json({
            code: -1000,
            msg: "notebook.update.not_found",
            data: null,
        });
    }

    // 如果要更新 parent_id，校验合法性
    if (parent_id !== undefined) {
        const newParentId = parent_id ?? null;

        // 不能指向自己
        if (newParentId === id) {
            return c.json({
                code: -1000,
                msg: "notebook.update.cannot_self_reference",
                data: null,
            });
        }

        // 校验新 parent 属于当前用户
        if (newParentId !== null) {
            const parentExists = await checkNodeOwnership(newParentId, uid);
            if (!parentExists) {
                return c.json({
                    code: -1000,
                    msg: "notebook.update.parent_not_found",
                    data: null,
                });
            }

            // 检查循环引用：新父节点不能是当前节点的子孙
            const cycle = await wouldCreateCycle(id, newParentId);
            if (cycle) {
                return c.json({
                    code: -1000,
                    msg: "notebook.update.circular_reference",
                    data: null,
                });
            }
        }
    }

    // 构建更新字段（部分更新，只更新传入的字段）
    const updates: Record<string, any> = { updated_at: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (parent_id !== undefined) updates.parent_id = parent_id ?? null;

    const result = await db
        .update(schema.notebooks)
        .set(updates)
        .where(and(
            eq(schema.notebooks.id, id),
            eq(schema.notebooks.user_id, uid),
        ))
        .returning()
        .get();

    return c.json({
        code: 200,
        msg: "notebook.update.success",
        data: result,
    });
};

/**
 * 批量排序分类（同级内拖动排序）
 * 前端传全量 items: [{id, sort_order}]
 * 后端从首个分类推断 parent_id，事务批量更新，返回该父节点下排序后的子分类列表
 */
export const sortNotebooks = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const payload = await c.req.json();

    const { items, parent_id } = payload || {};

    // 校验 items 非空数组
    if (!Array.isArray(items) || items.length === 0) {
        return c.json({
            code: -1000,
            msg: "notebook.sort.items_required",
            data: null,
        });
    }

    // 校验每个 item 的 id 和 sort_order 合法
    for (const item of items) {
        if (
            !item ||
            typeof item.id !== "number" ||
            typeof item.sort_order !== "number" ||
            !Number.isFinite(item.sort_order)
        ) {
            return c.json({
                code: -1000,
                msg: "notebook.sort.items_invalid",
                data: null,
            });
        }
    }

    // 从首个分类推断 parent_id，同时校验归属当前用户
    let parentId: number | null = null;
    if (parent_id !== undefined) {
        if (parent_id !== null && (typeof parent_id !== "number" || !Number.isFinite(parent_id))) {
            return c.json({
                code: -1000,
                msg: "notebook.sort.items_invalid",
                data: null,
            });
        }
        parentId = parent_id ?? null;
        if (parentId !== null) {
            const parentExists = await checkNodeOwnership(parentId, uid);
            if (!parentExists) {
                return c.json({
                    code: -1000,
                    msg: "notebook.sort.notebook_not_found",
                    data: null,
                });
            }
        }
    } else {
        const firstNode = await db
        .select({ parent_id: schema.notebooks.parent_id })
        .from(schema.notebooks)
        .where(and(
            eq(schema.notebooks.id, items[0].id),
            eq(schema.notebooks.user_id, uid),
        ))
        .get();

        if (!firstNode) {
            return c.json({
                code: -1000,
                msg: "notebook.sort.notebook_not_found",
                data: null,
            });
        }

        parentId = firstNode.parent_id;
    }

    // 事务内批量更新 sort_order（带 user_id 防越权）
    const itemIds = items.map((item) => item.id);
    const scopedRows = await db
        .select({ id: schema.notebooks.id })
        .from(schema.notebooks)
        .where(and(
            inArray(schema.notebooks.id, itemIds),
            eq(schema.notebooks.user_id, uid),
            parentId === null
                ? isNull(schema.notebooks.parent_id)
                : eq(schema.notebooks.parent_id, parentId),
        ))
        .all();
    if (scopedRows.length !== items.length) {
        return c.json({
            code: -1000,
            msg: "notebook.sort.notebook_not_found",
            data: null,
        });
    }

    const now = new Date();
    await db.transaction(async (tx) => {
        for (const item of items) {
            await tx
                .update(schema.notebooks)
                .set({
                    sort_order: item.sort_order,
                    updated_at: now,
                })
                .where(and(
                    eq(schema.notebooks.id, item.id),
                    eq(schema.notebooks.user_id, uid),
                    parentId === null
                        ? isNull(schema.notebooks.parent_id)
                        : eq(schema.notebooks.parent_id, parentId),
                ));
        }
    });

    // 返回该父节点下排序后的子分类列表（排序口径与 listNotebooks 一致）
    const notebooks = await db
        .select()
        .from(schema.notebooks)
        .where(and(
            eq(schema.notebooks.user_id, uid),
            parentId === null
                ? isNull(schema.notebooks.parent_id)
                : eq(schema.notebooks.parent_id, parentId),
        ))
        .orderBy(schema.notebooks.sort_order)
        .all();

    return c.json({
        code: 200,
        msg: "notebook.sort.success",
        data: notebooks,
    });
};

/**
 * 递归收集某个节点的所有子孙分类 ID（BFS，调用前确保所有节点属于同一用户）
 * @param rootIds 待删除的根分类 ID 集合
 * @returns 包含 rootIds 自身及其所有子孙节点 ID 的集合
 */
const collectDescendantIds = async (rootIds: number[]): Promise<Set<number>> => {
    const allIds = new Set(rootIds);
    let currentIds = [...rootIds];

    // 逐层向下查找子节点
    while (currentIds.length > 0) {
        const children = await db
            .select({ id: schema.notebooks.id })
            .from(schema.notebooks)
            .where(inArray(schema.notebooks.parent_id, currentIds))
            .all();

        currentIds = [];
        for (const child of children) {
            if (!allIds.has(child.id)) {
                allIds.add(child.id);
                currentIds.push(child.id);
            }
        }
    }

    return allIds;
};

/**
 * 删除笔记本/分类列表（硬删除），同时软删除其下所有笔记
 * 传入分类 ID 列表，后端递归查找所有子分类，事务内完成删除
 */
export const deleteNotebooks = async (c: Context) => {
    const uid = Number(c.get("uid"));
    const payload = await c.req.json();

    const { ids } = payload || {};

    // 校验 ids 非空数组
    if (!Array.isArray(ids) || ids.length === 0) {
        return c.json({
            code: -1000,
            msg: "notebook.delete.ids_required",
            data: null,
        });
    }

    // 校验每个 id 类型合法
    for (const id of ids) {
        if (typeof id !== "number" || !Number.isFinite(id) || id <= 0) {
            return c.json({
                code: -1000,
                msg: "notebook.delete.id_invalid",
                data: null,
            });
        }
    }

    // 批量校验所有 id 属于当前用户
    const ownedRows = await db
        .select({ id: schema.notebooks.id })
        .from(schema.notebooks)
        .where(and(
            inArray(schema.notebooks.id, ids),
            eq(schema.notebooks.user_id, uid),
        ))
        .all();

    if (ownedRows.length !== ids.length) {
        return c.json({
            code: -1000,
            msg: "notebook.delete.not_found",
            data: null,
        });
    }

    // 递归收集所有子孙分类 ID（包含传入的根 ID）
    const allNotebookIds = await collectDescendantIds(ids);
    const idList = [...allNotebookIds];

    let deletedNotebooks = 0;
    let deletedNotes = 0;

    await db.transaction(async (tx) => {
        // 1. 软删除这些分类下所有笔记
        const now = new Date();
        const notesResult = await tx
            .update(schema.notes)
            .set({
                is_deleted: 1,
                deleted_at: now,
                updated_at: now,
            })
            .where(and(
                inArray(schema.notes.notebook_id, idList),
                eq(schema.notes.user_id, uid),
            ))
            .returning({ id: schema.notes.id })
            .all();

        deletedNotes = notesResult.length;

        // 2. 硬删除所有分类（含子孙）
        const notebookResult = await tx
            .delete(schema.notebooks)
            .where(and(
                inArray(schema.notebooks.id, idList),
                eq(schema.notebooks.user_id, uid),
            ))
            .returning({ id: schema.notebooks.id })
            .all();

        deletedNotebooks = notebookResult.length;
    });

    return c.json({
        code: 200,
        msg: "notebook.delete.success",
        data: {
            deleted_notebooks: deletedNotebooks,
            deleted_notes: deletedNotes,
        },
    });
};
