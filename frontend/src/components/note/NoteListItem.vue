<script setup lang="ts">
/**
 * 笔记列表项
 *
 * 展示笔记的标题、更新时间、内容摘要。
 * 选中态高亮，置顶笔记有特殊标记。
 */
import { computed } from "vue";
import ZIcon from "@/components/DynamicIcon.vue";
import type { Note } from "@/types/note";

const props = defineProps<{
    note: Note;
    active: boolean;
}>();

const emit = defineEmits<{
    (e: "select", id: number): void;
    /** 右键笔记时触发，附带鼠标坐标用于菜单定位 */
    (e: "contextmenu", note: Note, e: MouseEvent): void;
}>();

/** 摘要：取 content 纯文本前 80 字符 */
const summary = computed(() => {
    const text = (props.note.content || "")
        .replace(/```[\s\S]*?```/g, "")          // 去掉代码块
        .replace(/`[^`]*`/g, "")                 // 去掉行内代码
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")    // 去掉图片
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接只保留文字
        .replace(/[#>*_~\-]/g, " ")              // 去掉 markdown 符号
        .replace(/\s+/g, " ")
        .trim();
    return text.slice(0, 80);
});

/** 格式化时间：年/月/日 时:分 */
const formatTime = (t: number | string) => {
    const d = new Date(t);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 是否置顶 */
const isPinned = computed(() => props.note.is_pinned === 1);
</script>

<template>
  <div
    class="cursor-pointer rounded-lg border px-3 py-2.5 transition"
    :class="
      active
        ? 'border-blue-400 bg-blue-50/50 shadow-sm'
        : 'border-slate-200/60 bg-white hover:border-slate-300 hover:shadow-sm'
    "
    @click="emit('select', note.id)"
    @contextmenu.prevent="(e: MouseEvent) => emit('contextmenu', note, e)"
  >
    <!-- 标题行：标题 + 置顶标记 -->
    <div class="flex items-center gap-1.5">
      <ZIcon
        v-if="isPinned"
        name="ri:pushpin-2-line"
        :size="14"
        color="#f59e0b"
        class="shrink-0"
      />
      <h3
        class="flex-1 truncate text-sm font-medium"
        :class="active ? 'text-blue-700' : 'text-slate-800'"
      >
        {{ note.title || "（无标题）" }}
      </h3>
    </div>

    <!-- 摘要：始终占一行高度，保证卡片高度一致 -->
    <p class="mt-1 line-clamp-1 text-xs text-slate-500">
      {{ summary || "\u00A0" }}
    </p>

    <!-- 时间 -->
    <div class="mt-1.5 text-[11px] text-slate-400">
      {{ formatTime(note.updated_at) }}
    </div>
  </div>
</template>
