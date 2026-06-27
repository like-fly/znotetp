<script setup lang="ts">
/**
 * 文档右侧目录组件（TOC）
 * 从父组件 inject 获取 headings 数据
 * PC 端固定在右侧栏，移动端通过浮动按钮触发弹窗展示
 */
import { computed, inject, ref, onMounted, onUnmounted, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";

const { t } = useI18n();

const props = defineProps<{
    /** 移动端时是否作为浮动弹窗 */
    floating?: boolean;
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

/** 注入父组件提供的标题列表 */
const headings = inject<Ref<{ level: number; text: string; id: string }[]>>("headings", ref([]));

/** 当前激活的标题 ID */
const activeId = ref<string>("");

/** 移动端弹窗是否可见 */
const showMobileToc = ref(false);

/** 内容区域容器引用（从父组件注入，用于监听滚动） */
const contentRef = inject<Ref<HTMLElement | null>>("contentRef", ref(null));

/** 有标题才显示 */
const hasHeadings = computed(() => headings.value.length > 0);

/** 平滑滚动到指定标题 */
const scrollToHeading = (id: string) => {
    activeId.value = id;
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // 移动端关闭弹窗
    if (props.floating) {
        showMobileToc.value = false;
        emit("close");
    }
};

/** 滚动监听：高亮当前可见标题 */
let scrollTimer: ReturnType<typeof setTimeout> | null = null;

const handleScroll = () => {
    if (scrollTimer) return;
    scrollTimer = setTimeout(() => {
        scrollTimer = null;
        if (headings.value.length === 0) return;

        // 从当前滚动位置向上找最近经过的标题
        let currentId = headings.value[0]?.id || "";
        for (const h of headings.value) {
            const el = document.getElementById(h.id);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (rect.top <= 120) {
                currentId = h.id;
            } else {
                break;
            }
        }
        activeId.value = currentId;
    }, 100);
};

onMounted(() => {
    // 监听内容区域的滚动事件
    const el = contentRef.value;
    if (el) {
        el.addEventListener("scroll", handleScroll, { passive: true });
    }
    // 同时监听窗口滚动（作为兜底）
    window.addEventListener("scroll", handleScroll, { passive: true });
});

onUnmounted(() => {
    const el = contentRef.value;
    if (el) {
        el.removeEventListener("scroll", handleScroll);
    }
    window.removeEventListener("scroll", handleScroll);
});
</script>

<template>
  <!-- PC 端：固定在右侧栏 -->
  <aside
    v-if="!floating && hasHeadings"
    class="hidden h-full flex-col border-l border-slate-200 bg-white xl:flex"
  >
    <div class="sticky top-0 border-b border-slate-100 bg-white/80 px-4 py-3 backdrop-blur-sm">
      <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">{{ t("doc.toc.title") }}</span>
    </div>
    <nav class="flex-1 overflow-y-auto px-3 py-2">
      <a
        v-for="h in headings"
        :key="h.id"
        class="block cursor-pointer truncate rounded-md py-1 text-xs transition"
        :class="[
          activeId === h.id ? 'text-blue-600 font-medium' : 'text-slate-500 hover:text-slate-700',
          h.level === 3 ? 'pl-3' : h.level === 4 ? 'pl-6' : '',
        ]"
        :title="h.text"
        @click.prevent="scrollToHeading(h.id)"
      >{{ h.text }}</a>
    </nav>
  </aside>

  <!-- 移动端：浮动按钮 + 弹窗 -->
  <template v-if="floating && hasHeadings">
    <!-- 浮动按钮 -->
    <button
      class="fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 shadow-lg ring-1 ring-slate-200/60 backdrop-blur-md transition hover:scale-105 hover:bg-white active:scale-95"
      @click="showMobileToc = !showMobileToc"
    >
      <ZIcon name="ri:list-unordered" :size="18" class="text-slate-600" />
    </button>

    <!-- 弹出目录面板 -->
    <Transition name="toc-slide">
      <div
        v-if="showMobileToc"
        class="fixed inset-0 z-40 flex flex-col bg-white"
      >
        <!-- 弹窗标题栏 -->
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span class="text-sm font-semibold text-slate-800">{{ t("doc.toc.title") }}</span>
          <button
            class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            @click="showMobileToc = false; emit('close')"
          >
            <ZIcon name="ri:close-line" :size="18" />
          </button>
        </div>
        <nav class="flex-1 overflow-y-auto px-4 py-3">
          <a
            v-for="h in headings"
            :key="h.id"
            class="block cursor-pointer truncate rounded-md py-2 text-sm transition"
            :class="[
              activeId === h.id ? 'text-blue-600 font-medium' : 'text-slate-600 hover:text-slate-800',
              h.level === 3 ? 'pl-4' : h.level === 4 ? 'pl-8' : '',
            ]"
            @click="scrollToHeading(h.id)"
          >{{ h.text }}</a>
        </nav>
      </div>
    </Transition>
  </template>
</template>

<style scoped>
.toc-slide-enter-active,
.toc-slide-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.toc-slide-enter-from,
.toc-slide-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
