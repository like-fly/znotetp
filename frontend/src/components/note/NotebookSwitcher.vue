<script setup lang="ts">
/**
 * 笔记本切换器
 *
 * 设计：左文字（仅展示，不可点击）+ 右切换按钮（点击展开下拉）
 * 下拉菜单：
 *   - 列表展示所有顶层笔记本（当前项带 ✓）
 *   - 底部固定一项 "+ 新建笔记本"（分割线隔开）
 *
 * Props:
 *   - notebooks: 顶层笔记本列表
 *   - modelValue: 当前选中的笔记本 id
 *
 * Emits:
 *   - update:modelValue: 切换笔记本
 *   - create: 请求新建笔记本
 */
import { computed } from "vue";
import { NDropdown } from "naive-ui";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import type { Notebook } from "@/types/note";

const { t } = useI18n();

const props = defineProps<{
    notebooks: Notebook[];
    modelValue: number | null;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: number): void;
    (e: "create"): void;
}>();

/** 当前激活的笔记本名 */
const activeTitle = computed(() => {
    return props.notebooks.find((nb) => nb.id === props.modelValue)?.title ?? "";
});

/** Trigger 显示文本：空态兜底"暂无笔记本" */
const triggerText = computed(() => activeTitle.value || t("note.notebook.empty_short"));

/** 下拉菜单选项 */
const dropdownOptions = computed(() => {
    const items: Array<Record<string, unknown>> = props.notebooks.map((nb) => ({
        key: nb.id,
        label: nb.title,
    }));
    items.push({ type: "divider", key: "d1" });
    items.push({
        key: "__create__",
        label: t("note.notebook.create.button"),
    });
    return items;
});

/** 处理菜单选择 */
const handleSelect = (key: string | number) => {
    if (key === "__create__") {
        emit("create");
    } else {
        emit("update:modelValue", key as number);
    }
};

/**
 * NDropdown 深色主题覆盖
 * NDropdown 的主题变量在自身（不通过 peers.Menu）
 * peers.Popover 控制外层弹层容器
 */
const dropdownDarkTheme = {
    peers: {
        Popover: {
            color: "rgb(30, 41, 59)", // slate-800 弹层背景
            borderRadius: "6px",
            dividerColor: "rgba(71, 85, 105, 0.6)", // slate-600/60
        },
    },
    // Dropdown 自身主题（菜单项配色）
    optionTextColor: "rgb(226, 232, 240)",          // slate-200
    optionTextColorHover: "rgb(241, 245, 249)",      // slate-100
    optionTextColorActive: "rgb(96, 165, 250)",      // blue-400
    optionColorHover: "rgba(71, 85, 105, 0.5)",      // slate-600/50
    optionColorActive: "rgba(96, 165, 250, 0.15)",   // blue-400/15
    dividerColor: "rgba(71, 85, 105, 0.6)",          // slate-600/60
    borderRadius: "6px",
};
</script>

<template>
  <!-- 卡片容器：仅用于布局，自身不可点击 -->
  <div
    class="flex w-full items-center gap-2 rounded-md border border-slate-600/60 bg-slate-700/50 px-3 py-2 text-sm text-slate-200"
  >
    <!-- 左侧：当前笔记本名（纯展示，不可点击） -->
    <span class="flex-1 truncate text-left">{{ triggerText }}</span>

    <!-- 右侧：切换按钮（只有这个能点开下拉） -->
    <NDropdown
      :options="dropdownOptions"
      trigger="click"
      placement="bottom-start"
      :theme-overrides="dropdownDarkTheme"
      @select="handleSelect"
    >
      <button
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-600/60 hover:text-slate-100"
        :title="t('note.notebook.switcher.placeholder')"
      >
        <ZIcon name="ri:swap-line" :size="16" color="currentColor" />
      </button>
    </NDropdown>
  </div>
</template>
