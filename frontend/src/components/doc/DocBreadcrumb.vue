<script setup lang="ts">
/**
 * 文档页面面包屑导航
 * - 首页：不显示
 * - 分类页：文档首页 → 分类标题
 * - 笔记页：文档首页 → 各级分类 → 笔记标题
 */
import { computed, inject, ref, type Ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

const router = useRouter();
const { t } = useI18n();

const slug = inject<string>("slug", "");
const tree = inject<Ref<any[]>>("docTree", ref([]));
const activeNoteId = inject<Ref<number | null>>("activeNoteId", ref(null));

/* ===== 数据类型 ===== */
interface DocNode {
    id: number; title: string; type: string;
    children: DocNode[];
    notes: { id: number; title: string; type: string }[];
}

/** 面包屑条目 */
interface Crumb {
    label: string;
    id?: number;
}

const items = computed<Crumb[]>(() => {
    const crumbs: Crumb[] = [];
    const noteId = activeNoteId.value;

    // 笔记页：显示分类路径（可点击），去掉末尾笔记标题
    if (noteId && tree.value.length > 0) {
        const path = findNotePathForBreadcrumb(tree.value, noteId);
        if (path) {
            for (const node of path) {
                crumbs.push({ label: node.title, id: node.id });
            }
        }
    }

    return crumbs;
});

/** 查找笔记所在的分类路径 */
const findNotePathForBreadcrumb = (nodes: DocNode[], noteId: number, path: DocNode[] = []): DocNode[] | null => {
    for (const node of nodes) {
        if (node.notes && node.notes.some((n) => n.id === noteId)) return [...path, node];
        if (node.children && node.children.length > 0) {
            const r = findNotePathForBreadcrumb(node.children, noteId, [...path, node]);
            if (r) return r;
        }
    }
    return null;
};

</script>

<template>
  <nav
    v-if="activeNoteId !== null && items.length > 0"
    class="flex items-center gap-1.5 pb-4 text-xs sm:text-sm text-slate-500"
  >
    <!-- 文档首页链接 -->
    <a class="cursor-pointer transition hover:text-blue-600" @click="router.push(`/doc/${slug}`)">{{ t("doc.breadcrumb.home") }}</a>

    <template v-for="(crumb, index) in items" :key="index">
      <span class="text-slate-300">/</span>
      <a
        v-if="crumb.id"
        class="cursor-pointer transition hover:text-blue-600"
        @click="router.push(`/doc/${slug}/notebook/${crumb.id}`)"
      >{{ crumb.label }}</a>
      <span v-else>{{ crumb.label }}</span>
    </template>
  </nav>
</template>
