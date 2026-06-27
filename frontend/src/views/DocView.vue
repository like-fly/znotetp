<script setup lang="ts">
/**
 * 公开文档主布局组件
 * - 获取文档树结构数据
 * - 通过 provide 向子组件提供数据
 * - 响应式三栏布局（PC/平板/手机）
 */
import { computed, onMounted, provide, ref, watch, watchEffect, type Ref } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import req from "@/utils/req";
import DocBreadcrumb from "@/components/doc/DocBreadcrumb.vue";
import DocHeader from "@/components/doc/DocHeader.vue";
import DocSidebar from "@/components/doc/DocSidebar.vue";
import DocToc from "@/components/doc/DocToc.vue";
import ZIcon from "@/components/DynamicIcon.vue";

const route = useRoute();
const { t } = useI18n();

/** 文档 slug */
const slug = computed(() => route.params.slug as string);

/** 当前激活的笔记 ID（路由参数，可能为 null） */
const activeNoteId = computed<number | null>(() => {
    const noteId = Number(route.params.noteId);
    return noteId && !isNaN(noteId) ? noteId : null;
});

/** 当前激活的分类 ID（路由参数，可能为 null） */
const activeNotebookId = computed<number | null>(() => {
    const id = Number(route.params.notebookId);
    return id && !isNaN(id) ? id : null;
});

/** 侧栏开关（移动端抽屉） */
const sidebarOpen = ref(false);

/** 是否移动端（<768px，用于判断 <router-view> 是否独立滚动）*/
const isMobile = ref(false);

/** 文档树数据 */
const tree = ref<any[]>([]);

/** 文档元信息 */
const docInfo = ref<any>({ title: "", description: "" });

/** 加载状态 */
const loading = ref(false);

/** 错误信息 */
const error = ref("");

/** TOC 标题列表 */
const headings: Ref<{ level: number; text: string; id: string }[]> = ref([]);

/** 内容区域引用（供 TOC 滚动监听使用） */
const contentRef = ref<HTMLElement | null>(null);

/** 文档展示标题：优先覆盖标题，否则用文档原标题 */
const displayTitle = computed(() => docInfo.value?.title || "");

/** 在树中递归查找指定 id 的分类节点（仅查分类节点，不查笔记，避免 id 冲突） */
const findCategoryById = (nodes: any[], id: number): any | null => {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findCategoryById(node.children, id);
            if (found) return found;
        }
    }
    return null;
};

/** 在树中递归查找指定 id 的笔记节点（仅查笔记，不查分类节点，避免 id 冲突） */
const findNoteById = (nodes: any[], id: number): any | null => {
    for (const node of nodes) {
        if (node.notes) {
            const note = node.notes.find((n: any) => n.id === id);
            if (note) return note;
        }
        if (node.children) {
            const found = findNoteById(node.children, id);
            if (found) return found;
        }
    }
    return null;
};

/** 当前激活的分类 */
const currentCategory = computed(() => {
    if (activeNotebookId.value !== null) {
        return findCategoryById(tree.value, activeNotebookId.value);
    }
    return null;
});

/** 当前激活的笔记 */
const currentNote = computed(() => {
    if (activeNoteId.value !== null) {
        return findNoteById(tree.value, activeNoteId.value);
    }
    return null;
});

/** 浏览器标题：笔记/分类页 = 【子级标题 - 主标题】，首页 = 主标题 */
const pageTitle = computed(() => {
    const main = displayTitle.value;
    const sub = currentNote.value || currentCategory.value;
    if (sub?.title) {
        return `${sub.title} - ${main}`;
    }
    return main;
});

/** 同步更新浏览器标签页标题 */
watchEffect(() => {
    document.title = pageTitle.value;
});

/** 获取文档结构 */
const fetchDoc = async () => {
    loading.value = true;
    error.value = "";
    try {
        const res = await req.get(`/api/doc/${slug.value}`);
        if (res.data?.code === 200) {
            tree.value = res.data.data?.tree || [];
            docInfo.value = res.data.data?.doc || {};
        } else {
            error.value = t("doc.public.not_found");
        }
    } catch {
        error.value = t("doc.public.not_found");
    } finally {
        loading.value = false;
    }
};

/** 向子组件提供数据 */
provide("docTree", tree);
provide("docInfo", docInfo);
provide("activeNoteId", activeNoteId);
provide("activeNotebookId", activeNotebookId);
provide("slug", slug.value);
provide("headings", headings);
provide("contentRef", contentRef);

/** 检测屏幕宽度 */
const checkMobile = () => {
    isMobile.value = window.innerWidth < 768;
};

onMounted(async () => {
    checkMobile();
    window.addEventListener("resize", checkMobile);
    await fetchDoc();
});

/** 路由 slug 变化时重新获取文档数据 */
watch(slug, () => {
    void fetchDoc();
});

/** 导航跳转时自动关闭移动端侧栏 */
watch(() => route.fullPath, () => {
    sidebarOpen.value = false;
});

/** 离开笔记页时清空 TOC 标题列表，避免在首页/分类页残留旧数据导致右侧 TOC 仍渲染 */
watch(activeNoteId, (newId) => {
    if (newId === null) {
        headings.value = [];
    }
});
</script>

<template>
  <!-- 加载中 -->
  <div
    v-if="loading"
    class="flex h-screen items-center justify-center bg-slate-50"
  >
    <div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
  </div>

  <!-- 错误 -->
  <div
    v-else-if="error"
    class="flex h-screen flex-col items-center justify-center bg-slate-50 text-slate-500"
  >
    <ZIcon name="ri:error-warning-line" :size="48" class="mb-4 opacity-40" />
    <p class="text-sm">{{ error }}</p>
  </div>

  <!-- 正常内容 -->
  <div
    v-else
    class="flex h-screen flex-col bg-slate-50"
    style="background-image: radial-gradient(ellipse at top, rgba(59,130,246,0.04), transparent 60%);"
  >
    <!-- 顶栏 -->
    <DocHeader
      :title="displayTitle"
      @toggle-sidebar="sidebarOpen = !sidebarOpen"
    />

    <!-- 主体三栏布局 -->
    <div class="flex flex-1 overflow-hidden">
      <!-- 左侧栏：PC 固定 | 移动端抽屉 -->
      <!-- PC 侧栏 -->
      <div class="hidden w-[320px] flex-shrink-0 lg:block">
        <DocSidebar />
      </div>

      <!-- 移动端抽屉 -->
      <Transition name="drawer-slide">
        <div
          v-if="sidebarOpen"
          class="fixed inset-0 z-30 lg:hidden"
        >
          <div class="absolute inset-0 bg-black/30" @click="sidebarOpen = false" />
          <div class="relative z-40 flex h-full w-[300px] max-w-[85vw] flex-col bg-white shadow-xl">
            <!-- 抽屉头部：关闭按钮 + 文档标题 -->
            <div class="flex h-12 flex-shrink-0 items-center justify-between border-b border-slate-200/60 bg-white/80 px-4 backdrop-blur-sm">
              <button
                class="-ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                @click="sidebarOpen = false"
              >
                <ZIcon name="ri:close-line" :size="18" />
              </button>
              <span class="truncate text-sm font-semibold text-slate-800">{{ displayTitle }}</span>
              <div class="w-8" />
            </div>
            <!-- 侧栏内容（填满抽屉剩余高度） -->
            <div class="flex-1 min-h-0">
              <DocSidebar />
            </div>
          </div>
        </div>
      </Transition>

      <!-- 中间内容区 -->
      <main
        ref="contentRef"
        class="flex-1 overflow-y-auto"
      >
        <!-- 面包屑 + 内容卡片统一居中 -->
        <div class="mx-auto max-w-4xl px-4 sm:px-6 pt-5">
          <DocBreadcrumb />
          <div class="mb-4 rounded-2xl border border-slate-200/70 bg-white px-6 py-6 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.03)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
            <router-view />
          </div>
          <!-- 版权信息 -->
          <div class="pb-6 text-center text-xs text-slate-400">
            &copy; {{ new Date().getFullYear() }}&nbsp;
            <i18n-t keypath="doc.footer.built_with" tag="span">
              <template #znote>
                <a href="https://github.com/helloxz/znote" target="_blank" class="text-blue-500 hover:underline">ZNote</a>
              </template>
            </i18n-t>
          </div>
        </div>
      </main>

      <!-- 右侧 TOC：仅笔记页且 xl 屏显示 -->
      <div
        v-if="activeNoteId !== null"
        class="hidden w-[200px] flex-shrink-0 xl:block"
      >
        <DocToc />
      </div>
    </div>

    <!-- 移动端 TOC 浮动按钮（仅 <1280px 显示）-->
    <div class="xl:hidden">
      <DocToc floating :key="activeNoteId" />
    </div>
  </div>
</template>

<style scoped>
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-slide-enter-active > div:last-child,
.drawer-slide-leave-active > div:last-child {
  transition: transform 0.2s ease;
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  opacity: 0;
}
.drawer-slide-enter-from > div:last-child {
  transform: translateX(-100%);
}
.drawer-slide-leave-to > div:last-child {
  transform: translateX(-100%);
}
</style>
