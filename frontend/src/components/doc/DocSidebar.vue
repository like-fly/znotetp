<script setup lang="ts">
/**
 * 文档左侧栏：搜索框 + 树形导航
 * 从父组件 inject 获取树数据和状态
 */
import { computed, inject, ref, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import DocTreeNode from "@/components/doc/DocTreeNode.vue";

const { t } = useI18n();

/** 注入父组件提供的文档树数据和状态 */
const tree = inject<Ref<any[]>>("docTree", ref([]));
const activeNoteId = inject<Ref<number | null>>("activeNoteId", ref(null));
const slug = inject<string>("slug", "");

/** 搜索关键词 */
const searchKeyword = ref("");

/** 根据搜索关键词过滤树（保留匹配的分类及其子节点） */
const filteredTree = computed(() => {
    const kw = searchKeyword.value.trim().toLowerCase();
    if (!kw) return tree.value;

    // 递归过滤：分类标题或笔记标题匹配则保留
    const filterNode = (node: any): any | null => {
        const titleMatch = node.title.toLowerCase().includes(kw);
        const filteredNotes = (node.notes || []).filter((n: any) =>
            n.title.toLowerCase().includes(kw),
        );
        const filteredChildren = (node.children || [])
            .map((c: any) => filterNode(c))
            .filter(Boolean);

        if (titleMatch || filteredNotes.length > 0 || filteredChildren.length > 0) {
            return {
                ...node,
                notes: titleMatch ? node.notes : filteredNotes,
                children: titleMatch ? node.children : filteredChildren,
            };
        }
        return null;
    };

    return tree.value.map((n) => filterNode(n)).filter(Boolean);
});

/** 是否有笔记正在被查看 */
const hasActiveNote = computed(() => activeNoteId.value !== null);
</script>

<template>
  <aside class="flex h-full flex-col border-r border-slate-200 bg-white">
    <!-- 搜索框 -->
    <div class="sticky top-0 z-10 border-b border-slate-100 bg-white/80 p-3 backdrop-blur-sm">
      <div class="relative">
        <ZIcon name="ri:search-line" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          v-model="searchKeyword"
          type="text"
          :placeholder="t('doc.search.placeholder')"
          class="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-7 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          @keydown.esc="searchKeyword = ''"
        />
        <!-- 清空按钮 -->
        <button
          v-if="searchKeyword"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          @click="searchKeyword = ''"
        >
          <ZIcon name="ri:close-line" :size="10" />
        </button>
      </div>
    </div>

    <!-- 树形导航 -->
    <nav class="flex-1 overflow-y-auto p-2">
      <!-- 空状态 -->
      <div
        v-if="tree.length === 0"
        class="flex flex-col items-center justify-center py-12 text-slate-400"
      >
        <ZIcon name="ri:file-text-line" :size="32" class="mb-2 opacity-50" />
        <span class="text-xs">{{ t("doc.tree.empty") }}</span>
      </div>

      <!-- 搜索无结果 -->
      <div
        v-else-if="searchKeyword && filteredTree.length === 0"
        class="py-8 text-center text-xs text-slate-400"
      >
        {{ t("doc.search.no_results") }}
      </div>

      <!-- 树形列表 -->
      <DocTreeNode
        v-for="node in filteredTree"
        :key="node.id"
        :node="node"
        :slug="slug"
        :active-note-id="activeNoteId"
        :search-keyword="searchKeyword"
      />
    </nav>
  </aside>
</template>
