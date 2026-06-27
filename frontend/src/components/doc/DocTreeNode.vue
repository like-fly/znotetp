<script setup lang="ts">
/**
 * 递归文档树节点
 * - 分类节点：点击箭头可折叠/展开子节点，点击名称高亮（桌面端跳转到分类附近）
 * - 笔记节点：点击跳转到笔记详情页面
 */
import { computed, inject, ref, type Ref } from "vue";
import { useRouter } from "vue-router";
import ZIcon from "@/components/DynamicIcon.vue";

const router = useRouter();

const props = defineProps<{
    /** 树节点数据 */
    node: {
        id: number;
        title: string;
        type: "notebook";
        children: any[];
        notes: { id: number; title: string; type: "note" }[];
    };
    /** 当前文档 slug */
    slug: string;
    /** 当前激活的笔记 ID */
    activeNoteId: number | null;
    /** 搜索关键词（用于高亮） */
    searchKeyword: string;
}>();

/** 注入当前激活的分类 ID */
const activeNotebookId = inject<Ref<number | null>>("activeNotebookId", ref(null));

/** 分类节点是否展开 */
const expanded = ref(false);

/** 当前分类是否处于激活状态（当前打开的分类页） */
const isActive = computed(() => {
    return activeNotebookId.value === props.node.id;
});

/** 切换展开/折叠 */
const toggleExpand = () => {
    expanded.value = !expanded.value;
};

/** 点击分类名称跳转到分类页面 */
const goToNotebook = (id: number) => {
    router.push(`/doc/${props.slug}/notebook-${id}`);
};

/** 点击笔记跳转 */
const goToNote = (noteId: number) => {
    router.push(`/doc/${props.slug}/note-${noteId}`);
};

/** 高亮匹配关键词 */
const highlightText = (text: string): string => {
    if (!props.searchKeyword) return text;
    const regex = new RegExp(`(${escapeRegex(props.searchKeyword)})`, "gi");
    return text.replace(regex, "<mark class='bg-yellow-200 rounded px-0.5'>$1</mark>");
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
</script>

<template>
  <div class="select-none">
    <!-- 分类标题行：点击名称跳转分类页，箭头折叠/展开 -->
    <div
      class="group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm transition"
      :class="isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100/80'"
      @click="goToNotebook(node.id)"
    >
      <!-- 折叠箭头（阻止事件冒泡，避免触发分类跳转） -->
      <button
        class="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-slate-400 transition hover:text-slate-600"
        @click.stop="toggleExpand"
      >
        <ZIcon name="ri:arrow-right-s-line" :size="12" class="transition-transform" :class="expanded ? 'rotate-90' : ''" />
      </button>
      <!-- 分类图标 -->
      <ZIcon :name="expanded ? 'ri:folder-open-line' : 'ri:folder-line'" :size="14" class="flex-shrink-0 opacity-60" />
      <span class="truncate text-sm font-medium" v-html="highlightText(node.title)"></span>
      <!-- 笔记数量 -->
      <span class="ml-auto flex-shrink-0 text-xs text-slate-400">{{ node.notes.length + node.children.reduce((s: number, c: any) => s + (c.notes?.length || 0), 0) }}</span>
    </div>

    <!-- 子节点列表 -->
    <div v-show="expanded" class="ml-3 border-l border-slate-200 pl-2">
      <!-- 笔记条目 -->
      <div
        v-for="note in node.notes"
        :key="note.id"
        class="group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm transition"
        :class="activeNoteId === note.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-slate-600 hover:bg-slate-100/80'"
        @click="goToNote(note.id)"
      >
        <ZIcon name="ri:file-text-line" :size="14" class="flex-shrink-0 opacity-50" />
        <span class="truncate" v-html="highlightText(note.title)"></span>
      </div>

      <!-- 子分类（递归） -->
      <DocTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :slug="slug"
        :active-note-id="activeNoteId"
        :search-keyword="searchKeyword"
      />
    </div>
  </div>
</template>
