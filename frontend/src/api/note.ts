/**
 * 笔记 API 封装层
 *
 * 与后端 routers.ts 中的 userRouter.notebook.note.* 路由对应。
 * 笔记的增删改查都基于 notebook_id（分类 id）。
 */
import req from "@/utils/req";
import type { CreateNotePayload, Note } from "@/types/note";

interface ApiResult<T> {
    code: number;
    msg: string;
    data: T;
}

/**
 * 获取指定分类下的笔记列表（不含软删除）
 * @param notebookId 分类 id
 */
export const fetchNoteList = async (notebookId: number): Promise<Note[]> => {
    const res = await req.get<ApiResult<Note[]>>("/api/user/notebook/note/list", {
        params: { notebook_id: notebookId },
    });
    if (res.data?.code === 200) {
        return res.data.data ?? [];
    }
    return [];
};

/**
 * 创建笔记
 */
export const createNote = async (payload: CreateNotePayload): Promise<Note | null> => {
    const res = await req.post<ApiResult<Note>>("/api/user/notebook/note/create", payload);
    if (res.data?.code === 200) {
        return res.data.data;
    }
    return null;
};

/**
 * 更新笔记（部分更新）
 * id 必传；title、content、notebook_id、is_pinned、sort_order 可选
 */
export const updateNote = async (
    id: number,
    payload: Partial<Pick<Note, "title" | "content" | "notebook_id" | "is_pinned" | "sort_order">>,
): Promise<Note | null> => {
    const res = await req.post<ApiResult<Note>>("/api/user/notebook/note/update", { id, ...payload });
    if (res.data?.code === 200) {
        return res.data.data;
    }
    return null;
};

/**
 * 删除笔记（软删除：后端置 is_deleted=1、deleted_at=now）
 * @param id 笔记 id
 */
export const deleteNote = async (id: number): Promise<Note | null> => {
    const res = await req.post<ApiResult<Note>>("/api/user/notebook/note/delete", { id });
    if (res.data?.code === 200) {
        return res.data.data;
    }
    return null;
};
