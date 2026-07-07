<script setup lang="ts">
/**
 * 分类树容器
 *
 * 职责：
 * 1. 展示当前选中笔记本下的所有子分类（递归树）
 * 2. 转发节点的选中、新建子分类事件给父组件
 * 3. 空态友好提示
 * 4. 顶层兄弟节点之间支持同级拖拽排序
 *
 * Props:
 *   - tree: 当前笔记本的 children（已经过滤过）
 *   - activeId: 当前选中的分类 id
 *
 * Emits:
 *   - select: 选中分类
 *   - addChild: 新建子分类
 */
import { computed, onMounted, provide, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useMessage } from "naive-ui";
import { VueDraggable } from "vue-draggable-plus";
import ZIcon from "@/components/DynamicIcon.vue";
import CategoryTreeNode from "@/components/note/CategoryTreeNode.vue";
import { useNoteStore } from "@/stores/note";
import type { NotebookNode } from "@/types/note";

const { t } = useI18n();
const message = useMessage();
const noteStore = useNoteStore();

const props = defineProps<{
    /** 当前笔记本的 children（已经过滤过） */
    tree: NotebookNode[];
    activeId: number | null;
    /** 是否为移动端视口 */
    isMobile: boolean;
}>();

const emit = defineEmits<{
    (e: "select", id: number): void;
    (e: "addChild", id: number, title: string): void;
    (e: "requestDialog", parentId: number, parentName: string): void;
    (e: "contextmenu", node: NotebookNode, event: MouseEvent): void;
}>();

/** 是否为空 */
const isEmpty = computed(() => props.tree.length === 0);

/**
 * 本地分类树副本（可被 VueDraggable 直接 mutate）
 * 通过 watch 与 props.tree 保持同步，拖拽完成后用后端返回数据覆盖
 */
const localTree = ref<NotebookNode[]>([]);

watch(
    () => props.tree,
    (newTree) => {
        localTree.value = [...newTree];
    },
    { immediate: true },
);

// ==================== 展开/折叠状态管理 ====================

/**
 * 展开状态集合（所有层级的展开节点 ID 集合）
 * - 顶级分类：同一时刻仅允许展开一个（互斥），展开新节点时自动关闭上一个
 * - 子级分类（二级、三级等）：自由展开/折叠，不受互斥限制
 * - 状态持久化到 sessionStorage，刷新页面或切换笔记本后可恢复
 */
/** shallowRef：整个替换 Set 而非原地修改，避免 Vue 对 Set 的深层 Proxy 在 provide/inject 场景下触发响应式边缘问题 */
const expandedIds = shallowRef<Set<number>>(new Set());

/** 顶级节点 ID 集合（用于互斥判断） */
const topLevelIds = computed(() => new Set(props.tree.map((n) => n.id)));

/** sessionStorage key，按笔记本 ID 隔离，不同笔记本各自维护展开状态 */
const getStorageKey = () => `note:expandedCategories:${noteStore.activeNotebookId}`;

/**
 * 从 sessionStorage 恢复展开状态
 * 加载时过滤掉已不存在的陈旧 ID（分类可能已被删除）
 */
const loadFromSession = () => {
    const raw = sessionStorage.getItem(getStorageKey());
    if (!raw) {
        expandedIds.value = new Set();
        return;
    }
    try {
        // 收集当前树中所有有效 ID，用于过滤陈旧数据
        const allValidIds = new Set<number>();
        const collect = (nodes: NotebookNode[]) => {
            for (const n of nodes) {
                allValidIds.add(n.id);
                collect(n.children);
            }
        };
        collect(props.tree);
        expandedIds.value = new Set(
            (JSON.parse(raw) as number[]).filter((id) => allValidIds.has(id)),
        );
    } catch {
        expandedIds.value = new Set();
    }
};

/** 将当前展开状态写入 sessionStorage */
const saveToSession = () => {
    sessionStorage.setItem(getStorageKey(), JSON.stringify([...expandedIds.value]));
};

/**
 * 切换节点展开/折叠状态
 * - 顶级分类（level === 0）：互斥模式，展开新节点时自动关闭其他已展开的顶级节点
 * - 子级分类（level > 0）：自由切换，不影响其他节点
 * - 全程基于 Set 拷贝构建新集合，避免遍历时修改集合导致的不确定行为
 * @param nodeId 节点 ID
 * @param level 节点层级（0 = 顶级）
 */
const toggleExpand = (nodeId: number, level: number) => {
    const current = expandedIds.value;
    const topIds = topLevelIds.value;
    const next = new Set<number>();

    if (level === 0) {
        if (current.has(nodeId)) {
            // 已展开 → 折叠：移除自身，保留其他所有节点
            for (const id of current) {
                if (id !== nodeId) next.add(id);
            }
        } else {
            // 展开 → 移除所有其他顶级节点（互斥），保留子级节点，添加当前节点
            for (const id of current) {
                if (!topIds.has(id)) next.add(id);
            }
            next.add(nodeId);
        }
    } else {
        // 子级分类自由切换
        for (const id of current) {
            if (id !== nodeId) next.add(id);
        }
        if (!current.has(nodeId)) {
            next.add(nodeId);
        }
    }

    expandedIds.value = next;
    saveToSession();
};

/** provide 展开上下文，供所有递归子节点 inject 使用 */
provide("categoryExpand", { expandedIds, toggleExpand });

// 组件挂载时 tree 数据已就绪（父组件 v-if loading 控制），从 session 恢复展开状态
onMounted(loadFromSession);

// 笔记本切换时重新恢复展开状态（tree 同步更新，无需 nextTick）
watch(() => noteStore.activeNotebookId, loadFromSession);

/**
 * 拖拽结束回调
 * VueDraggable 已将新顺序写入 localTree，据此构建 items 调用后端排序接口
 * 用后端返回数据刷新 store，store 更新后 props 变化会再次同步 localTree
 */
const onDragEnd = async () => {
    const items = localTree.value.map((n, idx) => ({
        id: n.id,
        sort_order: idx,
    }));
    const result = await noteStore.sortNotebooks(items);
    if (result) {
        message.success(t("notebook.sort.success"));
    } else {
        // 排序失败：回退本地顺序
        localTree.value = [...props.tree];
        message.error(t("notebook.sort.failed"));
    }
};
</script>

<template>
  <div class="space-y-0.5">
    <!-- 有分类时递归渲染，顶层节点支持同级拖拽排序 -->
    <template v-if="!isEmpty">
      <VueDraggable
        v-model="localTree"
        :animation="150"
        :disabled="noteStore.loading.save"
        handle=".drag-handle"
        @end="onDragEnd"
      >
        <CategoryTreeNode
          v-for="node in localTree"
          :key="node.id"
          :node="node"
          :active-id="activeId"
          :level="0"
          :is-mobile="props.isMobile"
          @select="(id: number) => emit('select', id)"
          @add-child="(id: number, title: string) => emit('addChild', id, title)"
          @request-dialog="(pid: number, pname: string) => emit('requestDialog', pid, pname)"
          @contextmenu="(node: NotebookNode, e: MouseEvent) => emit('contextmenu', node, e)"
        />
      </VueDraggable>
    </template>

    <!-- 空态提示 -->
    <div v-else class="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700/60">
        <ZIcon name="ri:folder-open-line" :size="20" color="#94a3b8" />
      </div>
      <p class="text-xs text-slate-400">{{ t("note.category.empty") }}</p>
    </div>
  </div>
</template>
