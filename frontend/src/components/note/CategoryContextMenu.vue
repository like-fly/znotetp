<script setup lang="ts">
/**
 * 分类右键菜单组件
 *
 * 通过 NDropdown 的 manual 触发模式 + x/y 坐标定位，
 * 在鼠标右键位置弹出菜单。选项：
 *   - 重命名：弹出 Dialog 修改分类名称
 *   - 移动分类：弹出 MoveDialog 选择目标父节点
 *   - 删除分类：暂未实现
 *
 * 由父组件控制 show / x / y / node，本组件只负责渲染和事件转发。
 */
import { h } from "vue";
import { NDropdown } from "naive-ui";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import type { NotebookNode } from "@/types/note";

/** 右键菜单可触发的操作 */
export type CategoryContextAction = "rename" | "delete" | "move" | "export";

const props = defineProps<{
    show: boolean;
    x: number;
    y: number;
    node: NotebookNode | null;
}>();

const emit = defineEmits<{
    (e: "update:show", val: boolean): void;
    (e: "select", action: CategoryContextAction, node: NotebookNode): void;
}>();

const { t } = useI18n();

const dropdownThemeOverrides = {
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
};

const menuOptions = [
    {
        label: t("note.category.context.rename"),
        key: "rename",
        icon: () => h(ZIcon, { name: "ri:edit-line", size: 16 }),
    },
    {
        label: t("note.category.context.move"),
        key: "move",
        icon: () => h(ZIcon, { name: "ri:arrow-right-circle-line", size: 16 }),
    },
    {
        label: t("note.category.context.export"),
        key: "export",
        icon: () => h(ZIcon, { name: "ri:download-line", size: 16 }),
    },
    {
        label: t("note.category.context.delete"),
        key: "delete",
        icon: () => h(ZIcon, { name: "ri:delete-bin-line", size: 16 }),
    },
];

const handleSelect = (key: string) => {
    if (props.node && (key === "rename" || key === "delete" || key === "move" || key === "export")) {
        emit("select", key as CategoryContextAction, props.node);
    }
    emit("update:show", false);
};

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
