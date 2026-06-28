<script setup lang="ts">
/**
 * 笔记本切换器
 *
 * 设计：左侧 NSelect 下拉（默认展示当前选中笔记本，切换后自动刷新下方分类）
 *      中间更多按钮（点击展开操作菜单：重命名 / 删除，与添加按钮风格一致）
 *      右侧 + 按钮（点击弹窗新建顶层笔记本；笔记本数量达上限时禁用并变灰）
 *
 * Props:
 *   - notebooks: 顶层笔记本列表
 *   - modelValue: 当前选中的笔记本 id
 *
 * Emits:
 *   - update:modelValue: 切换笔记本
 *   - create: 请求新建笔记本
 *   - rename: 请求重命名当前笔记本
 *   - delete: 请求删除当前笔记本
 */
import { computed, h } from "vue";
import { NConfigProvider, NSelect, NDropdown, darkTheme } from "naive-ui";
import type { GlobalThemeOverrides } from "naive-ui";
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
    (e: "rename"): void;
    (e: "delete"): void;
}>();

/** 顶层笔记本数量上限；达到上限时禁用 + 按钮，避免无限制扩张 */
const MAX_NOTEBOOKS = 10;

/** 局部暗色主题覆盖：primary 用更亮的 blue-400 系，让选中项在 slate-800 上通透清晰不发虚 */
const darkThemeOverrides: GlobalThemeOverrides = {
    common: {
        primaryColor: "#60a5fa",
        primaryColorHover: "#3b82f6",
        primaryColorPressed: "#2563eb",
        primaryColorSuppl: "#93c5fd",
    },
};

/** NSelect 选项：每项前加 📔 emoji 图标，下拉项和触发器展示两处都显示 */
const selectOptions = computed(() =>
    props.notebooks.map((nb) => ({
        label: `📔 ${nb.title}`,
        value: nb.id,
    })),
);

/** 切换笔记本：选中即触发，父级 handleSwitchNotebook → noteStore.switchNotebook 会自动重置并刷新下方分类 */
const handleChange = (val: number | null) => {
    if (val !== null && val !== undefined) {
        emit("update:modelValue", val);
    }
};

/** 是否已达笔记本数量上限（+ 按钮禁用依据） */
const isCreateDisabled = computed(() => props.notebooks.length >= MAX_NOTEBOOKS);

/** 是否未选中笔记本（更多按钮禁用依据：无选中则无操作目标） */
const isMoreDisabled = computed(() => props.modelValue === null);

/** 新建顶层笔记本：与原下拉内「+ 新建笔记本」逻辑一致，由父级弹 CreateNotebookDialog */
const handleCreate = () => {
    if (isCreateDisabled.value) return;
    emit("create");
};

/** 更多操作下拉菜单选项 */
const moreMenuOptions = computed(() => [
    {
        label: t("note.notebook.more.rename"),
        key: "rename",
        icon: () => h(ZIcon, { name: "ri:edit-line", size: 16 }),
    },
    {
        label: t("note.notebook.more.delete"),
        key: "delete",
        icon: () => h(ZIcon, { name: "ri:delete-bin-line", size: 16 }),
    },
]);

/** 更多菜单项选择：根据 key 触发对应操作，由父级处理具体逻辑 */
const handleMoreSelect = (key: string) => {
    if (isMoreDisabled.value) return;
    if (key === "rename") {
        emit("rename");
    } else if (key === "delete") {
        emit("delete");
    }
};
</script>

<template>
  <!-- 局部暗色主题：仅作用于本组件的 NSelect 和 NDropdown，不污染全局亮色主题；与侧栏 bg-slate-800 融合 -->
  <NConfigProvider :theme="darkTheme" :theme-overrides="darkThemeOverrides">
    <!-- 容器：NSelect（左）+ 更多按钮（中）+ 新建按钮（右），高度对齐 medium=34px -->
    <div class="flex w-full items-stretch gap-2 py-2 text-sm text-slate-200">
    <!-- 左侧：笔记本下拉选择，默认展示当前选中，切换后自动刷新下方分类 -->
    <NSelect
      class="flex-1"
      size="medium"
      :value="modelValue"
      :options="selectOptions"
      :placeholder="t('note.notebook.switcher.placeholder')"
      @update:value="handleChange"
    />

    <!-- 中间：更多操作（蓝色调，与添加按钮风格一致；未选中笔记本时禁用） -->
    <NDropdown
      trigger="click"
      placement="bottom-end"
      :options="moreMenuOptions"
      :disabled="isMoreDisabled"
      @select="handleMoreSelect"
    >
      <button
        class="flex w-[34px] shrink-0 items-center justify-center rounded transition disabled:cursor-not-allowed"
        :class="isMoreDisabled
          ? 'bg-blue-500/15 text-blue-300/40'
          : 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 hover:text-blue-200'"
        :disabled="isMoreDisabled"
        :title="t('note.notebook.more.button')"
      >
        <ZIcon name="ri:more-line" :size="18" color="currentColor" />
      </button>
    </NDropdown>

    <!-- 右侧：+ 新建顶层笔记本（蓝色调常亮背景，达上限时仅淡化文字，背景保留） -->
    <button
      class="flex w-[34px] shrink-0 items-center justify-center rounded transition disabled:cursor-not-allowed"
      :class="isCreateDisabled
        ? 'bg-blue-500/15 text-blue-300/40'
        : 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 hover:text-blue-200'"
      :disabled="isCreateDisabled"
      :title="isCreateDisabled
        ? t('note.notebook.create.disabled_tooltip')
        : t('note.notebook.create.button')"
      @click="handleCreate"
    >
      <ZIcon name="ri:add-line" :size="18" color="currentColor" />
    </button>
    </div>
  </NConfigProvider>
</template>
