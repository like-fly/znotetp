<script setup lang="ts">
import { useRouter } from "vue-router";
import { inject } from "vue";
import ZIcon from "@/components/DynamicIcon.vue";

const router = useRouter();

defineProps<{
    /** 文档标题 */
    title: string;
}>();

const slug = inject<string>("slug", "");

const emit = defineEmits<{
    (e: "toggle-sidebar"): void;
}>();
</script>

<template>
  <header
    class="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-slate-200/60 bg-white/70 px-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-md supports-[backdrop-filter]:bg-white/60"
  >
    <div class="flex items-center gap-3">
      <!-- 移动端汉堡按钮 -->
      <button
        class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
        @click="emit('toggle-sidebar')"
      >
        <ZIcon name="ri:menu-line" :size="18" />
      </button>
      <a
        class="flex cursor-pointer items-center gap-1.5 truncate rounded-lg px-1 -ml-1"
        @click="router.push(`/doc/${slug}`)"
      >
        <ZIcon name="ri:booklet-line" :size="18" />
        <span class="truncate text-base font-semibold text-slate-800">{{ title }}</span>
      </a>
    </div>
    <!-- 右上角：GitHub 链接（新窗口打开） -->
    <a
      href="https://github.com/helloxz/znote"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="GitHub"
      class="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
    >
      <ZIcon name="ri:github-fill" :size="24" />
    </a>
  </header>
</template>
