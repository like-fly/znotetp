<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import ZIcon from "@/components/DynamicIcon.vue";
import { useNoteStore } from "@/stores/note";
import type { Note, NotebookNode } from "@/types/note";

const noteStore = useNoteStore();

const props = defineProps<{
    node: NotebookNode;
    activeCategoryId: number | null;
    activeNoteId: number | null;
    level: number;
    isMobile: boolean;
}>();

const emit = defineEmits<{
    (e: "selectCategory", id: number): void;
    (e: "selectNote", id: number): void;
    (e: "requestDialog", parentId: number, parentName: string): void;
    (e: "contextmenu", node: NotebookNode, event: MouseEvent): void;
    (e: "noteContextmenu", note: Note, event: MouseEvent): void;
}>();

const { expandedIds, toggleExpand: doToggleExpand } = inject<{
    expandedIds: { value: Set<number> };
    toggleExpand: (nodeId: number) => void;
}>("fileTreeExpand", {
    expandedIds: { value: new Set<number>() },
    toggleExpand: () => {},
});

const isExpanded = computed(() => expandedIds.value.has(props.node.id));
const directNotes = computed(() => noteStore.notesByCategory[props.node.id] ?? []);
const localChildren = ref<NotebookNode[]>([]);

watch(
    () => props.node.children,
    (children) => { localChildren.value = [...children]; },
    { immediate: true },
);

const loadNotesIfNeeded = async () => {
    if (!noteStore.loadedCategoryIds.has(props.node.id)) {
        await noteStore.loadCategoryNotes(props.node.id);
    }
};

const toggleExpand = async (e: Event) => {
    e.stopPropagation();
    doToggleExpand(props.node.id);
    if (!isExpanded.value) {
        await loadNotesIfNeeded();
    }
};

const handleSelect = async () => {
    const wasExpanded = isExpanded.value;

    if (!wasExpanded) {
        doToggleExpand(props.node.id);
    } else {
        doToggleExpand(props.node.id);
    }

    await loadNotesIfNeeded();
    emit("selectCategory", props.node.id);
};

const onChildDragEnd = async () => {
    const items = localChildren.value.map((node, idx) => ({ id: node.id, sort_order: idx }));
    const result = await noteStore.sortNotebooks(items);
    if (!result) {
        localChildren.value = [...props.node.children];
    }
};
</script>

<template>
  <div class="select-none">
    <div
      data-file-tree-item="true"
      class="group flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[13px] leading-5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
      :style="{ paddingLeft: `${10 + level * 16}px` }"
      @click.stop="handleSelect"
      @contextmenu.prevent.stop="(e: MouseEvent) => emit('contextmenu', node, e)"
    >
      <div
        class="drag-handle shrink-0 cursor-grab text-slate-400 transition"
        :class="props.isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      >
        <ZIcon name="ri:draggable" :size="13" color="currentColor" />
      </div>
      <button
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-slate-200"
        type="button"
        @click="toggleExpand"
      >
        <ZIcon :name="isExpanded ? 'ri:arrow-down-s-line' : 'ri:arrow-right-s-line'" :size="14" color="currentColor" />
      </button>
      <ZIcon :name="isExpanded ? 'ri:folder-open-line' : 'ri:folder-line'" :size="15" color="currentColor" class="shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ node.title }}</span>
    </div>

    <div v-if="isExpanded">
      <VueDraggable
        v-if="localChildren.length > 0"
        v-model="localChildren"
        :animation="150"
        :disabled="noteStore.loading.save"
        handle=".drag-handle"
        @end="onChildDragEnd"
      >
        <FileTreeNode
          v-for="child in localChildren"
          :key="child.id"
          :node="child"
          :active-category-id="activeCategoryId"
          :active-note-id="activeNoteId"
          :level="level + 1"
          :is-mobile="props.isMobile"
          @select-category="(id: number) => emit('selectCategory', id)"
          @select-note="(id: number) => emit('selectNote', id)"
          @request-dialog="(pid: number, pname: string) => emit('requestDialog', pid, pname)"
          @contextmenu="(n: NotebookNode, e: MouseEvent) => emit('contextmenu', n, e)"
          @note-contextmenu="(note: Note, e: MouseEvent) => emit('noteContextmenu', note, e)"
        />
      </VueDraggable>

      <button
        v-for="note in directNotes"
        :key="note.id"
        data-file-tree-item="true"
        class="group flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-[13px] leading-5 transition"
        :class="activeNoteId === note.id ? 'bg-slate-200 text-slate-950' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'"
        :style="{ paddingLeft: `${34 + (level + 1) * 16}px` }"
        type="button"
        @click.stop="emit('selectNote', note.id)"
        @contextmenu.prevent.stop="(e: MouseEvent) => emit('noteContextmenu', note, e)"
      >
        <ZIcon name="ri:file-text-line" :size="14" color="currentColor" class="shrink-0 opacity-80" />
        <span class="min-w-0 flex-1 truncate">{{ note.title }}</span>
      </button>
    </div>
  </div>
</template>

<script lang="ts">
export default { name: "FileTreeNode" };
</script>
