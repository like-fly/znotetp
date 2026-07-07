<script setup lang="ts">
import { h } from "vue";
import { NDropdown } from "naive-ui";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import type { NotebookNode } from "@/types/note";

export type CategoryContextAction =
    | "create_note"
    | "create_folder"
    | "rename"
    | "delete"
    | "move"
    | "export";

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
        label: t("note.note.create.button"),
        key: "create_note",
        icon: () => h(ZIcon, { name: "ri:sticky-note-add-line", size: 16 }),
    },
    {
        label: t("note.category.add_child"),
        key: "create_folder",
        icon: () => h(ZIcon, { name: "ri:folder-add-line", size: 16 }),
    },
    { type: "divider", key: "d-create" },
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
    if (
        props.node &&
        (
            key === "create_note" ||
            key === "create_folder" ||
            key === "rename" ||
            key === "delete" ||
            key === "move" ||
            key === "export"
        )
    ) {
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
