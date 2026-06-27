<script setup lang="ts">
/**
 * 分类页：展示某个分类及其子分类下的所有笔记
 * 复用 useFlattenDocTree 把当前分类作为子树根传入，渲染结构与 DocHome 完全一致
 */
import { computed, inject, ref, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import { useFlattenDocTree, countAllNotes } from "@/composables/useFlattenDocTree";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const tree = inject<Ref<any[]>>("docTree", ref([]));
const slug = inject<string>("slug", "");

/** 当前分类 ID */
const notebookId = computed(() => Number(route.params.notebookId));

/** 递归查找指定分类节点 */
const findNode = (nodes: any[], id: number): any | null => {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNode(node.children, id);
            if (found) return found;
        }
    }
    return null;
};

/** 当前分类节点 */
const categoryNode = computed(() => findNode(tree.value, notebookId.value));

/** 把当前分类包成单元素子树传入 composable，递归时从 depth=0 开始 */
const subTree = computed(() => (categoryNode.value ? [categoryNode.value] : []));
const { sections } = useFlattenDocTree(subTree);

/** 格式化日期 */
const formatDate = (val: any): string => {
    if (!val) return "";
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
};

/** 点击笔记跳转 */
const goToNote = (noteId: number) => {
    router.push(`/doc/${slug}/note-${noteId}`);
};
</script>

<template>
  <div v-if="categoryNode">
    <!-- 空状态 -->
    <div
      v-if="sections.length === 0"
      class="flex flex-col items-center justify-center py-16 text-slate-400"
    >
      <ZIcon name="ri:file-text-line" :size="40" class="mb-3 opacity-50" />
      <span class="text-sm">{{ t("doc.home.empty") }}</span>
    </div>

    <!-- 分类分组列表（与 DocHome 一致） -->
    <template v-else>
      <div
        v-for="section in sections"
        :key="section.category.id"
        :style="{ paddingLeft: section.depth * 20 + 'px' }"
        class="mb-6"
      >
        <!-- 分类标题行：名称 | 笔记数量 -->
        <div class="mb-2 flex items-baseline gap-2 border-b border-slate-100 pb-2">
          <ZIcon name="ri:folder-line" :size="16" class="text-slate-400 flex-shrink-0" />
          <h3 class="font-semibold text-slate-800">{{ section.category.title }}</h3>
          <span class="text-xs text-slate-400">{{ countAllNotes(section.category) }} {{ t("doc.home.note_count") }}</span>
        </div>

        <!-- 笔记条目列表：标题 ···· 更新时间 -->
        <div
          v-for="note in section.notes"
          :key="note.id"
          :style="section.hasChildren ? { paddingLeft: '20px' } : {}"
          class="group flex cursor-pointer items-center rounded-lg px-3 py-2 transition-all duration-200 hover:translate-x-0.5 hover:bg-slate-50 hover:shadow-sm"
          @click="goToNote(note.id)"
        >
          <div class="flex w-full items-center gap-2">
            <ZIcon name="ri:file-text-line" :size="14" class="flex-shrink-0 text-slate-300 group-hover:text-blue-400" />
            <span class="truncate text-sm text-slate-700 group-hover:text-blue-600">{{ note.title }}</span>
            <span class="mx-2 flex-1 border-b border-dashed border-slate-200" />
            <span class="flex-shrink-0 text-xs text-slate-400">{{ formatDate(note.updated_at) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- 分类不存在 -->
  <div v-else class="py-16 text-center text-xs text-slate-400">
    {{ t("doc.search.no_results") }}
  </div>
</template>
