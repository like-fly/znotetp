<script setup lang="ts">
/**
 * 笔记右键菜单组件
 *
 * 通过 NDropdown 的 manual 触发模式 + x/y 坐标定位，
 * 在鼠标右键位置弹出菜单。选项：
 *   - 移入回收站：调用后端软删除接口
 *   - 置顶笔记 / 取消置顶：根据 note.is_pinned 智能切换文案
 *   - 移动笔记：弹出 MoveDialog 选择目标分类
 *
 * 由父组件控制 show / x / y / note，本组件只负责渲染和事件转发。
 */
import { computed, h } from "vue";
import { NDropdown } from "naive-ui";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import type { Note } from "@/types/note";

/** 右键菜单可触发的操作 */
export type NoteContextAction = "rename" | "trash" | "pin" | "move" | "open_new_window" | "permanent_delete" | "share" | "disable_vectorize" | "enable_vectorize";

const props = defineProps<{
    /** 菜单是否显示 */
    show: boolean;
    /** 菜单横坐标（clientX） */
    x: number;
    /** 菜单纵坐标（clientY） */
    y: number;
    /** 当前右键的笔记（用于判断是否已置顶） */
    note: Note | null;
}>();

const emit = defineEmits<{
    /** 关闭菜单（v-model:show 的配套事件） */
    (e: "update:show", val: boolean): void;
    /** 选中某操作时触发，父组件调用对应 API */
    (e: "select", action: NoteContextAction, note: Note): void;
}>();

const { t } = useI18n();

/** NDropdown 主题覆盖：8px 圆角 + 细边框 */
const dropdownThemeOverrides = {
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
};

/** 当前笔记是否已置顶（决定菜单项文案） */
const isPinned = computed(() => props.note?.is_pinned === 1);

/** 当前笔记是否允许向量化 */
const isVectorized = computed(() => props.note?.allow_vectorize === 1);

/** 菜单选项配置 */
const menuOptions = computed(() => {
    const isDeleted = props.note?.is_deleted === 1;
    return [
        {
            label: t("note.context.open_new_window"),
            key: "open_new_window",
            icon: () => h(ZIcon, { name: "ri:external-link-line", size: 16 }),
        },
        {
            label: t("note.context.share"),
            key: "share",
            icon: () => h(ZIcon, { name: "ri:share-forward-line", size: 16 }),
        },
        {
            label: t("note.context.move_note"),
            key: "move",
            icon: () => h(ZIcon, { name: "ri:arrow-right-circle-line", size: 16 }),
        },
        {
            label: t("note.category.context.rename"),
            key: "rename",
            icon: () => h(ZIcon, { name: "ri:edit-line", size: 16 }),
        },
        {
            label: isPinned.value ? t("note.context.unpin") : t("note.context.pin"),
            key: "pin",
            icon: () => h(ZIcon, { name: "ri:pushpin-2-line", size: 16 }),
        },
        {
            label: isVectorized.value ? t("note.context.disable_vectorize") : t("note.context.enable_vectorize"),
            key: isVectorized.value ? "disable_vectorize" : "enable_vectorize",
            icon: () => h(ZIcon, { name: isVectorized.value ? "ri:brain-line" : "ri:brain-fill", size: 16 }),
        },
        {
            label: t("note.context.trash"),
            key: "trash",
            icon: () => h(ZIcon, { name: "ri:delete-bin-line", size: 16 }),
        },
        {
            label: t("note.context.permanent_delete"),
            key: "permanent_delete",
            icon: () => h(ZIcon, { name: "ri:delete-bin-6-fill", size: 16, color: "#e74c3c" }),
        },
    ].filter((item) => !(isDeleted && (item.key === "trash" || item.key === "open_new_window" || item.key === "pin" || item.key === "share" || item.key === "disable_vectorize" || item.key === "enable_vectorize")) && !(!isDeleted && item.key === "permanent_delete"));
});

/** NDropdown 选中某项时：转发给父组件处理，并关闭菜单 */
const handleSelect = (key: string) => {
    if (props.note && (key === "rename" || key === "trash" || key === "pin" || key === "move" || key === "open_new_window" || key === "permanent_delete" || key === "share" || key === "disable_vectorize" || key === "enable_vectorize")) {
        emit("select", key as NoteContextAction, props.note);
    }
    emit("update:show", false);
};

/** 点击外部 / ESC 关闭时同步状态 */
const handleClickoutside = () => {
    emit("update:show", false);
};
</script>

<template>
  <NDropdown
    placement="bottom-start"
    trigger="manual"
    :show="show"
    :x="x"
    :y="y"
    :options="menuOptions"
    :theme-overrides="dropdownThemeOverrides"
    @select="handleSelect"
    @clickoutside="handleClickoutside"
  />
</template>
