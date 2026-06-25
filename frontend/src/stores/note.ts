/**
 * 笔记工作台 Pinia Store
 *
 * 设计要点：
 * 1. 后端 notebook/list 直接返回树形结构（NotebookNode[]），前端单一数据源 notebookTree
 * 2. 笔记按 notebook_id 维度缓存（notesByCategory），避免重复请求
 * 3. 聚合笔记（aggregatedNotes）缓存"某节点下所有笔记 id 集合"，切换分类时秒出
 * 4. 当前选中的笔记本/分类/笔记用 ref 跟踪，所有组件通过 store 联动
 * 5. create/update/sort 通过不可变递归更新 notebookTree，保持响应式
 */
import { defineStore } from "pinia";
import * as notebookApi from "@/api/notebook";
import * as noteApi from "@/api/note";
import type { CreateNotebookPayload, CreateNotePayload, Note, Notebook, NotebookNode, SortNoteItem, SortNotebookItem } from "@/types/note";

interface LoadingState {
    tree: boolean;     // 笔记本树加载中
    notes: boolean;    // 笔记列表加载中
    save: boolean;     // 创建/更新操作中
    search: boolean;   // 全文搜索中
}

/** sessionStorage 存储 key 常量 */
const SESSION_KEYS = {
    notebook: "note-active-notebook-id",
    category: "note-active-category-id",
    note: "note-active-note-id",
};

/** 从 sessionStorage 读取 ID，无值时返回 null */
const readSessionId = (key: string): number | null => {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
};

/** 写入 sessionStorage（null 时清除） */
const writeSessionId = (key: string, val: number | null): void => {
    if (val === null) {
        sessionStorage.removeItem(key);
    } else {
        sessionStorage.setItem(key, String(val));
    }
};

// ==================== 树操作工具函数（纯函数，不可变更新） ====================

/**
 * 在树中递归查找指定 id 的节点
 * @returns 匹配节点，未找到返回 null
 */
const findNodeById = (tree: NotebookNode[], id: number): NotebookNode | null => {
    for (const node of tree) {
        if (node.id === id) return node;
        if (node.children.length > 0) {
            const found = findNodeById(node.children, id);
            if (found) return found;
        }
    }
    return null;
};

/**
 * 将新节点插入树中（不可变，返回新树）
 * - parent_id 为 null：插入顶层，按 sort_order 重新排序
 * - parent_id 不为 null：递归找到父节点，插入其 children 并重新排序
 */
const insertNodeIntoTree = (tree: NotebookNode[], newNode: NotebookNode): NotebookNode[] => {
    if (newNode.parent_id === null) {
        return [...tree, newNode].sort((a, b) => a.sort_order - b.sort_order);
    }
    return tree.map((node) => {
        if (node.id === newNode.parent_id) {
            return {
                ...node,
                children: [...node.children, newNode].sort((a, b) => a.sort_order - b.sort_order),
            };
        }
        if (node.children.length > 0) {
            return { ...node, children: insertNodeIntoTree(node.children, newNode) };
        }
        return node;
    });
};

/**
 * 递归更新树中指定 id 的节点数据（不可变，返回新树）
 * 用 updates 覆盖节点字段，保留原有 children 结构
 */
const updateNodeInTree = (
    tree: NotebookNode[],
    id: number,
    updates: Notebook,
): NotebookNode[] => {
    return tree.map((node) => {
        if (node.id === id) {
            // 展开 updates 覆盖可变字段，显式保留 children
            return { ...node, ...updates, children: node.children };
        }
        if (node.children.length > 0) {
            return { ...node, children: updateNodeInTree(node.children, id, updates) };
        }
        return node;
    });
};

/**
 * 批量更新树中节点的 sort_order 并对每层重新排序（不可变，返回新树）
 * @param sortMap id → sort_order 映射
 */
const updateSortOrderInTree = (
    tree: NotebookNode[],
    sortMap: Map<number, number>,
): NotebookNode[] => {
    return tree
        .map((node) => {
            const newSort = sortMap.get(node.id);
            const updated = newSort !== undefined
                ? { ...node, sort_order: newSort }
                : node;
            if (updated.children.length > 0) {
                return { ...updated, children: updateSortOrderInTree(updated.children, sortMap) };
            }
            return updated;
        })
        .sort((a, b) => a.sort_order - b.sort_order);
};

export const useNoteStore = defineStore("note", {
    state: () => ({
        /** 笔记本树（后端返回的树形结构，顶层节点数组，子节点嵌在 children 里） */
        notebookTree: [] as NotebookNode[],
        /** 已加载过笔记的分类 id 集合（用于避免重复请求） */
        loadedCategoryIds: new Set<number>(),
        /** 分类 id → 该分类下的笔记列表 */
        notesByCategory: {} as Record<number, Note[]>,
        /** 当前选中的笔记本（顶层）id（优先从 sessionStorage 恢复） */
        activeNotebookId: readSessionId(SESSION_KEYS.notebook),
        /** 当前选中的分类 id（null 表示未选中）（优先从 sessionStorage 恢复） */
        activeCategoryId: readSessionId(SESSION_KEYS.category),
        /** 当前选中的笔记 id（优先从 sessionStorage 恢复） */
        activeNoteId: readSessionId(SESSION_KEYS.note),
        /** 是否处于搜索态（第二栏显示搜索结果而非分类列表） */
        searchMode: false,
        /** 当前搜索关键词 */
        searchKeyword: "",
        /** 搜索结果列表（跨分类，按 BM25 相关性排序） */
        searchResults: [] as Note[],
        /** 加载状态 */
        loading: {
            tree: false,
            notes: false,
            save: false,
            search: false,
        } as LoadingState,
    }),

    getters: {
        /**
         * 当前选中的笔记本节点（顶层笔记本，直接在 notebookTree 顶层查找）
         */
        activeNotebook(state): NotebookNode | null {
            if (state.activeNotebookId === null) return null;
            return state.notebookTree.find((n) => n.id === state.activeNotebookId) ?? null;
        },

        /**
         * 当前选中的分类节点（可在任意层级，递归查找）
         */
        activeCategory(state): NotebookNode | null {
            if (state.activeCategoryId === null) return null;
            return findNodeById(state.notebookTree, state.activeCategoryId);
        },

        /**
         * 当前选中的笔记
         * 优先从分类缓存中查找；搜索态下也搜索 searchResults
         */
        activeNote(state): Note | null {
            if (state.activeNoteId === null) return null;
            // 先从分类缓存查找
            for (const list of Object.values(state.notesByCategory)) {
                const found = list.find((n) => n.id === state.activeNoteId);
                if (found) return found;
            }
            // 搜索态下从搜索结果中查找（覆盖未加载过分类的笔记）
            if (state.searchMode) {
                const found = state.searchResults.find((n) => n.id === state.activeNoteId);
                if (found) return found;
            }
            return null;
        },

        /**
         * 第二栏展示用：搜索态返回搜索结果，否则返回当前选中分类下的直属笔记列表
         *
         * 正常态：只取该分类自身的笔记（不含后代分类），排除软删除后排序
         * 排序口径与后端 listNotes 一致：置顶在前 → sort_order 升序 → 创建时间倒序
         */
        displayedNotes(state): Note[] {
            // 搜索态：直接返回搜索结果（已按 BM25 排序，不重新排序）
            if (state.searchMode) return state.searchResults;

            if (state.activeCategoryId === null) return [];

            const list = state.notesByCategory[state.activeCategoryId] ?? [];
            return list
                .filter((n) => n.is_deleted === 0)
                .sort((a, b) => {
                    if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;            // 置顶在前
                    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;       // sort_order 升序
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // 创建时间倒序
                });
        },

        /**
         * 根据 notebook_id（分类 id）查询分类名称
         * 用于搜索结果中显示笔记所属分类
         */
        getCategoryName(state): (notebookId: number) => string {
            return (notebookId: number) => {
                const node = findNodeById(state.notebookTree, notebookId);
                return node?.title ?? "";
            };
        },
    },

    actions: {
        /**
         * 加载笔记本树（首次进入工作台时调用）
         * 后端直接返回树形结构，无需前端组装
         * 如果 sessionStorage 中保存了上次选中的分类和笔记，一并恢复
         */
        async loadNotebookTree() {
            this.loading.tree = true;
            try {
                const tree = await notebookApi.fetchNotebookList();
                this.notebookTree = tree;

                // 默认选中第一个顶层笔记本（仅在 sessionStorage 无缓存时）
                if (this.activeNotebookId === null && tree.length > 0) {
                    this.activeNotebookId = tree[0].id;
                    writeSessionId(SESSION_KEYS.notebook, this.activeNotebookId);
                } else if (this.activeNotebookId !== null) {
                    // 校验恢复的 notebookId 是否有效，无效则清除
                    const valid = !!findNodeById(tree, this.activeNotebookId);
                    if (!valid) {
                        this.activeNotebookId = null;
                        this.activeCategoryId = null;
                        this.activeNoteId = null;
                        writeSessionId(SESSION_KEYS.notebook, null);
                        writeSessionId(SESSION_KEYS.category, null);
                        writeSessionId(SESSION_KEYS.note, null);
                    }
                }

                // 恢复上次选中的分类：只加载该分类自身的笔记缓存
                if (this.activeCategoryId !== null) {
                    const savedNoteId = this.activeNoteId;
                    // 先清空笔记选中，保证后续恢复时（null→id）触发 watch 更新草稿
                    this.activeNoteId = null;
                    // 校验恢复的 categoryId 是否有效
                    const catValid = !!findNodeById(tree, this.activeCategoryId);
                    if (!catValid) {
                        this.activeCategoryId = null;
                        writeSessionId(SESSION_KEYS.category, null);
                        writeSessionId(SESSION_KEYS.note, null);
                        return;
                    }
                    // 只加载当前分类的笔记缓存
                    if (!this.loadedCategoryIds.has(this.activeCategoryId)) {
                        await this.loadCategoryNotes(this.activeCategoryId);
                    }
                    // 恢复笔记选中
                    if (savedNoteId !== null) {
                        this.activeNoteId = savedNoteId;
                    }
                }
            } finally {
                this.loading.tree = false;
            }
        },

        /**
         * 切换顶层笔记本
         * 切换后重置分类选中状态，清空搜索态，同步写入 sessionStorage
         */
        switchNotebook(id: number) {
            this.activeNotebookId = id;
            this.activeCategoryId = null;
            this.activeNoteId = null;
            this.searchMode = false;
            this.searchKeyword = "";
            this.searchResults = [];
            writeSessionId(SESSION_KEYS.notebook, id);
            writeSessionId(SESSION_KEYS.category, null);
            writeSessionId(SESSION_KEYS.note, null);
        },

        /**
         * 选中分类，按需加载该分类下的笔记，同步写入 sessionStorage
         */
        async selectCategory(id: number | null) {
            this.activeCategoryId = id;
            this.activeNoteId = null;
            writeSessionId(SESSION_KEYS.category, id);
            writeSessionId(SESSION_KEYS.note, null);
            if (id !== null && !this.loadedCategoryIds.has(id)) {
                await this.loadCategoryNotes(id);
            }
        },

        /**
         * 加载指定分类的笔记（带缓存）
         */
        async loadCategoryNotes(categoryId: number) {
            this.loading.notes = true;
            try {
                const notes = await noteApi.fetchNoteList(categoryId);
                this.notesByCategory = { ...this.notesByCategory, [categoryId]: notes };
                this.loadedCategoryIds.add(categoryId);
            } finally {
                this.loading.notes = false;
            }
        },

        /**
         * 选中笔记，同步写入 sessionStorage
         */
        selectNote(id: number | null) {
            this.activeNoteId = id;
            writeSessionId(SESSION_KEYS.note, id);
        },

        /**
         * 创建笔记本（顶层）或子分类
         * 后端返回扁平 Notebook，前端补 children 后插入树中合适位置
         */
        async createNotebook(payload: CreateNotebookPayload) {
            this.loading.save = true;
            try {
                const result = await notebookApi.createNotebook(payload);
                if (result) {
                    // 后端返回扁平节点，补 children 转为树节点
                    const newNode: NotebookNode = { ...result, children: [] };
                    this.notebookTree = insertNodeIntoTree(this.notebookTree, newNode);
                }
                return result;
            } finally {
                this.loading.save = false;
            }
        },

        /**
         * 更新笔记本/分类
         * 更新成功后递归更新树中对应节点（保留 children 结构）
         */
        async updateNotebook(id: number, payload: { title?: string; description?: string }) {
            this.loading.save = true;
            try {
                const result = await notebookApi.updateNotebook(id, payload);
                if (result) {
                    this.notebookTree = updateNodeInTree(this.notebookTree, id, result);
                }
                return result;
            } finally {
                this.loading.save = false;
            }
        },

        /**
         * 批量排序分类（同级内拖动排序）
         * 前端传全量 items，后端事务更新后返回该父节点下排序后的子分类列表
         * 用返回数据递归更新树中对应节点的 sort_order，并对各层重新排序
         * @param items 分类 id 及对应排序值
         */
        async sortNotebooks(items: SortNotebookItem[]) {
            this.loading.save = true;
            try {
                const result = await notebookApi.sortNotebooks(items);
                if (result) {
                    // 构建 id → sort_order 映射，递归更新并重新排序
                    const sortMap = new Map(result.map((n) => [n.id, n.sort_order]));
                    this.notebookTree = updateSortOrderInTree(this.notebookTree, sortMap);
                }
                return result;
            } finally {
                this.loading.save = false;
            }
        },

        /**
         * 创建笔记
         */
        async createNote(payload: CreateNotePayload) {
            this.loading.save = true;
            try {
                const result = await noteApi.createNote(payload);
                if (result) {
                    // 写入对应分类的笔记列表
                    const existing = this.notesByCategory[result.notebook_id] ?? [];
                    this.notesByCategory = {
                        ...this.notesByCategory,
                        [result.notebook_id]: [result, ...existing],
                    };
                    this.loadedCategoryIds.add(result.notebook_id);
                }
                return result;
            } finally {
                this.loading.save = false;
            }
        },

        /**
         * 更新笔记（部分更新）
         * 更新成功后同步更新本地缓存（含分类缓存和搜索结果）
         */
        async updateNote(
            id: number,
            payload: Partial<Pick<import("@/types/note").Note, "title" | "content" | "notebook_id" | "is_pinned" | "sort_order">>,
        ) {
            this.loading.save = true;
            try {
                const result = await noteApi.updateNote(id, payload);
                if (result) {
                    // 同步更新分类缓存中对应的笔记
                    for (const cid of Object.keys(this.notesByCategory)) {
                        const list = this.notesByCategory[Number(cid)];
                        const idx = list.findIndex((n) => n.id === id);
                        if (idx !== -1) {
                            list[idx] = result;
                            this.notesByCategory = { ...this.notesByCategory };
                            break;
                        }
                    }
                    // 搜索态下同步更新搜索结果列表
                    if (this.searchMode) {
                        const sidx = this.searchResults.findIndex((n) => n.id === id);
                        if (sidx !== -1) {
                            this.searchResults = this.searchResults.map((n, i) =>
                                i === sidx ? result : n,
                            );
                        }
                    }
                }
                return result;
            } finally {
                this.loading.save = false;
            }
        },

        /**
         * 删除笔记（软删除）
         * 后端置 is_deleted=1，前端从对应分类缓存中移除该笔记；
         * 若删除的是当前激活笔记，清空选中回到空态。
         */
        async deleteNote(id: number) {
            this.loading.save = true;
            try {
                const result = await noteApi.deleteNote(id);
                if (result) {
                    // 从对应分类的笔记列表中移除
                    for (const cid of Object.keys(this.notesByCategory)) {
                        const list = this.notesByCategory[Number(cid)];
                        const idx = list.findIndex((n) => n.id === id);
                        if (idx !== -1) {
                            this.notesByCategory = {
                                ...this.notesByCategory,
                                [Number(cid)]: list.filter((n) => n.id !== id),
                            };
                            break;
                        }
                    }
                    // 若删除的是当前激活笔记，清空选中（第三栏回到空态）
                    if (this.activeNoteId === id) {
                        this.selectNote(null);
                    }
                }
                return result;
            } finally {
                this.loading.save = false;
            }
        },

        /**
         * 批量排序笔记（同分类内拖动排序）
         * 前端传全量 items，后端事务更新后返回该分类排序后的笔记列表
         * 用返回数据覆盖对应分类的本地缓存
         * @param items 笔记 id 及对应排序值
         */
        async sortNotes(items: SortNoteItem[]) {
            this.loading.save = true;
            try {
                const result = await noteApi.sortNotes(items);
                if (result) {
                    // 后端返回的列表属于同一分类，找出 notebook_id 后覆盖本地缓存
                    const notebookId = result[0]?.notebook_id;
                    if (notebookId !== undefined) {
                        this.notesByCategory = {
                            ...this.notesByCategory,
                            [notebookId]: result,
                        };
                    }
                }
                return result;
            } finally {
                this.loading.save = false;
            }
        },

        /**
         * 全文搜索笔记（FTS5 + trigram）
         * 搜索当前顶层笔记本下所有子分类的笔记，结果替换第二栏列表
         * @param keyword 搜索关键词（最少 3 字符）
         */
        async searchNotes(keyword: string) {
            if (this.activeNotebookId === null) return;
            this.loading.search = true;
            this.searchMode = true;
            this.searchKeyword = keyword;
            try {
                const results = await noteApi.searchNotes(this.activeNotebookId, keyword);
                this.searchResults = results ?? [];
            } finally {
                this.loading.search = false;
            }
        },

        /**
         * 清空搜索，恢复分类列表
         */
        clearSearch() {
            this.searchMode = false;
            this.searchKeyword = "";
            this.searchResults = [];
        },
    },
});
