/**
 * 笔记本 API 封装层
 *
 * 与后端 routers.ts 中的 userRouter.notebook.* 路由一一对应。
 * 所有方法在 token 失效时会由 axios 拦截器统一处理（业务侧只关心 code === 200）。
 */
import req from "@/utils/req";
import type { CreateNotebookPayload, Notebook, NotebookNode, SortNotebookItem } from "@/types/note";

/** 统一接口返回结构 */
interface ApiResult<T> {
    code: number;
    msg: string;
    data: T;
}

/**
 * 获取当前用户的笔记本树（树形结构）
 * 后端一次 SQL 查全量并递归组装，按 sort_order 升序返回
 * 返回顶层节点数组，每个节点含 children（递归嵌套）
 */
export const fetchNotebookList = async (): Promise<NotebookNode[]> => {
    const res = await req.get<ApiResult<NotebookNode[]>>("/api/user/notebook/list");
    if (res.data?.code === 200) {
        return res.data.data ?? [];
    }
    return [];
};

/**
 * 获取顶层笔记本（parent_id 为 null）
 * 用于下拉框展示
 */
export const fetchTopNotebooks = async (): Promise<Notebook[]> => {
    const res = await req.get<ApiResult<Notebook[]>>("/api/user/notebook/top");
    if (res.data?.code === 200) {
        return res.data.data ?? [];
    }
    return [];
};

/**
 * 创建笔记本或子分类
 * - 不传 parent_id：创建顶层笔记本
 * - 传 parent_id：创建对应父节点的子分类
 */
export const createNotebook = async (payload: CreateNotebookPayload): Promise<Notebook | null> => {
    const res = await req.post<ApiResult<Notebook>>("/api/user/notebook/create", payload);
    if (res.data?.code === 200) {
        return res.data.data;
    }
    return null;
};

/**
 * 更新笔记本/分类（部分更新）
 * 支持更新 title、description 等字段
 */
export const updateNotebook = async (
    id: number,
    payload: { title?: string; description?: string; parent_id?: number | null; sort_order?: number },
): Promise<Notebook | null> => {
    const res = await req.post<ApiResult<Notebook>>("/api/user/notebook/update", { id, ...payload });
    if (res.data?.code === 200) {
        return res.data.data;
    }
    return null;
};

/**
 * 批量排序分类（同级内拖动排序）
 * 前端传全量 items，后端事务更新后返回该父节点下排序后的子分类列表
 * @param items 分类 id 及对应排序值
 * @returns 更新后的分类列表（失败返回 null）
 */
export const sortNotebooks = async (items: SortNotebookItem[], parentId?: number | null): Promise<Notebook[] | null> => {
    const res = await req.post<ApiResult<Notebook[]>>("/api/user/notebook/sort", {
        items,
        ...(parentId !== undefined ? { parent_id: parentId } : {}),
    });
    if (res.data?.code === 200) {
        return res.data.data ?? [];
    }
    return null;
};

/**
 * 删除笔记本/分类列表（硬删除），同时软删除其下所有笔记
 * @param ids 待删除的分类 ID 列表
 * @returns 成功返回删除统计，失败返回 null
 */
export const deleteNotebooks = async (
    ids: number[],
): Promise<{ deleted_notebooks: number; deleted_notes: number } | null> => {
    const res = await req.post<
        ApiResult<{ deleted_notebooks: number; deleted_notes: number }>
    >("/api/user/notebook/delete", { ids });
    if (res.data?.code === 200) {
        return res.data.data;
    }
    return null;
};
