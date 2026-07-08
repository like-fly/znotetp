<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useMessage } from "naive-ui";
import { VueDraggable } from "vue-draggable-plus";
import ZIcon from "@/components/DynamicIcon.vue";
import { useNoteStore } from "@/stores/note";
import type { Note, NotebookNode } from "@/types/note";

type DragKind = "category" | "note" | null;
type DragSession = {
    kind: DragKind;
    id: number | null;
};
type SortableLikeEvent = {
    item: HTMLElement;
    dragged?: HTMLElement;
    related?: HTMLElement;
    originalEvent?: DragEvent;
};

const { t } = useI18n();
const message = useMessage();
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

const { dragSession, setDragging } = inject<{
    dragSession: { value: DragSession };
    setDragging?: (kind: DragKind, id?: number | null) => void;
}>("fileTreeDrag", {
    dragSession: {
        value: {
            kind: null,
            id: null,
        },
    },
    setDragging: () => {},
});

const categoryGroup = { name: "file-tree-categories", pull: true, put: ["file-tree-categories"] };
const noteGroup = { name: "file-tree-notes", pull: true, put: ["file-tree-notes"] };

const currentDrag = computed(() => dragSession.value);
const isExpanded = computed(() => expandedIds.value.has(props.node.id));
const directNotes = computed(() => noteStore.notesByCategory[props.node.id] ?? []);
const localChildren = ref<NotebookNode[]>([]);
const localNotes = ref<Note[]>([]);
const expandTimer = ref<number | null>(null);

watch(
    () => props.node.children,
    (children) => { localChildren.value = [...children]; },
    { immediate: true },
);

watch(
    () => directNotes.value,
    (notes) => { localNotes.value = [...notes]; },
    { immediate: true },
);

const findNodeById = (nodes: NotebookNode[], id: number): NotebookNode | null => {
    for (const node of nodes) {
        if (node.id === id) return node;
        const child = findNodeById(node.children, id);
        if (child) return child;
    }
    return null;
};

const containsNode = (node: NotebookNode | null, id: number): boolean => {
    if (!node) return false;
    if (node.id === id) return true;
    return node.children.some((child) => containsNode(child, id));
};

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
    doToggleExpand(props.node.id);
    await loadNotesIfNeeded();
    emit("selectCategory", props.node.id);
};

const categorySortItems = () => localChildren.value.map((node, idx) => ({ id: node.id, sort_order: idx }));
const noteSortItems = () => localNotes.value.map((note, idx) => ({ id: note.id, sort_order: idx }));

const rollbackChildren = async () => {
    localChildren.value = [...props.node.children];
    await noteStore.silentRefreshTree();
};

const rollbackNotes = async () => {
    localNotes.value = [...directNotes.value];
    await noteStore.silentRefreshCategoryNotes();
};

const canMoveCategory = (event: SortableLikeEvent) => {
    if (pointerInsideFolderDropTrigger(event)) return false;
    const draggedEl = event.dragged ?? event.item;
    const draggedId = Number(draggedEl?.dataset.categoryId);
    if (!Number.isFinite(draggedId)) return false;
    const draggedNode = findNodeById(noteStore.notebookTree, draggedId);
    return draggedId !== props.node.id && !containsNode(draggedNode, props.node.id);
};

const pointerInsideFolderDropTrigger = (event: SortableLikeEvent) => {
    const pointer = event.originalEvent;
    if (!pointer || !event.related) return false;
    const row = event.related.closest("[data-category-id]");
    if (!row) return false;
    const triggers = row.querySelectorAll<HTMLElement>('[data-folder-drop-trigger="true"]');
    return [...triggers].some((trigger) => {
        const rect = trigger.getBoundingClientRect();
        return pointer.clientX >= rect.left
            && pointer.clientX <= rect.right
            && pointer.clientY >= rect.top
            && pointer.clientY <= rect.bottom;
    });
};

const setDraggingFromElement = (kind: Exclude<DragKind, null>, element: HTMLElement) => {
    const raw = kind === "category" ? element.dataset.categoryId : element.dataset.noteId;
    const id = Number(raw);
    setDragging?.(kind, Number.isFinite(id) ? id : null);
};

const clearDragging = () => {
    clearExpandTimer();
    setDragging?.(null, null);
};

const handleCategorySort = async () => {
    const result = await noteStore.sortNotebooks(categorySortItems(), props.node.id);
    if (!result) {
        await rollbackChildren();
        message.error(t("notebook.sort.failed"));
    }
};

const handleCategoryAdd = async (event: SortableLikeEvent) => {
    const categoryId = Number(event.item.dataset.categoryId);
    const newIndex = localChildren.value.findIndex((node) => node.id === categoryId);
    if (!Number.isFinite(categoryId) || newIndex < 0) {
        await rollbackChildren();
        return;
    }
    const items = categorySortItems();
    const moved = await noteStore.moveCategory(categoryId, props.node.id, newIndex);
    if (!moved) {
        await rollbackChildren();
        message.error(t("note.move.failed"));
        return;
    }
    const result = await noteStore.sortNotebooks(items, props.node.id);
    if (!result) {
        await rollbackChildren();
        message.error(t("notebook.sort.failed"));
    }
};

const handleNoteSort = async () => {
    const result = await noteStore.sortNotes(noteSortItems(), props.node.id);
    if (!result) {
        await rollbackNotes();
        message.error(t("note.sort.failed"));
    }
};

const handleNoteAdd = async (event: SortableLikeEvent) => {
    const noteId = Number(event.item.dataset.noteId);
    const newIndex = localNotes.value.findIndex((note) => note.id === noteId);
    if (!Number.isFinite(noteId) || newIndex < 0) {
        await rollbackNotes();
        return;
    }
    const items = noteSortItems();
    const moved = await noteStore.moveNote(noteId, props.node.id, newIndex);
    if (!moved) {
        await rollbackNotes();
        message.error(t("note.move.failed"));
        return;
    }
    const result = await noteStore.sortNotes(items, props.node.id);
    if (!result) {
        await rollbackNotes();
        message.error(t("note.sort.failed"));
    }
};

const canExpandForCurrentDrag = () => {
    if (!dragSession.value.kind || dragSession.value.id === null || isExpanded.value) return false;
    if (dragSession.value.kind === "note") return true;
    const draggedNode = findNodeById(noteStore.notebookTree, dragSession.value.id);
    return dragSession.value.id !== props.node.id && !containsNode(draggedNode, props.node.id);
};

const clearExpandTimer = () => {
    if (expandTimer.value !== null) {
        window.clearTimeout(expandTimer.value);
        expandTimer.value = null;
    }
};

const scheduleExpandForDrop = () => {
    if (!canExpandForCurrentDrag() || expandTimer.value !== null) return;
    expandTimer.value = window.setTimeout(async () => {
        expandTimer.value = null;
        if (!canExpandForCurrentDrag()) return;
        doToggleExpand(props.node.id);
        await loadNotesIfNeeded();
    }, 600);
};

onBeforeUnmount(clearExpandTimer);
</script>

<template>
  <div class="select-none" :data-category-id="node.id">
    <div
      data-file-tree-item="true"
      class="group flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[13px] leading-5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
      :class="activeCategoryId === node.id ? 'bg-slate-200 text-slate-950' : ''"
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
        data-folder-drop-trigger="true"
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-slate-200"
        type="button"
        @click="toggleExpand"
        @dragenter.prevent="scheduleExpandForDrop"
        @dragover.prevent="scheduleExpandForDrop"
        @dragleave="clearExpandTimer"
      >
        <ZIcon :name="isExpanded ? 'ri:arrow-down-s-line' : 'ri:arrow-right-s-line'" :size="14" color="currentColor" />
      </button>
      <span
        data-folder-drop-trigger="true"
        class="flex h-4 w-4 shrink-0 items-center justify-center"
        @dragenter.prevent="scheduleExpandForDrop"
        @dragover.prevent="scheduleExpandForDrop"
        @dragleave="clearExpandTimer"
      >
        <ZIcon :name="isExpanded ? 'ri:folder-open-line' : 'ri:folder-line'" :size="15" color="currentColor" />
      </span>
      <span class="min-w-0 flex-1 truncate">{{ node.title }}</span>
    </div>

    <div v-if="isExpanded">
      <VueDraggable
        v-model="localChildren"
        :class="['min-h-1', currentDrag.kind === 'category' ? 'min-h-6' : '']"
        :animation="150"
        :disabled="noteStore.loading.save"
        :group="categoryGroup"
        :move="canMoveCategory"
        handle=".drag-handle"
        @start="(e: SortableLikeEvent) => setDraggingFromElement('category', e.item)"
        @end="clearDragging"
        @update="handleCategorySort"
        @add="handleCategoryAdd"
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

      <VueDraggable
        v-model="localNotes"
        :class="['min-h-1', currentDrag.kind === 'note' ? 'min-h-6' : '']"
        :animation="150"
        :disabled="noteStore.loading.save"
        :group="noteGroup"
        handle=".note-drag-handle"
        @start="(e: SortableLikeEvent) => setDraggingFromElement('note', e.item)"
        @end="clearDragging"
        @update="handleNoteSort"
        @add="handleNoteAdd"
      >
        <button
          v-for="note in localNotes"
          :key="note.id"
          :data-note-id="note.id"
          data-file-tree-item="true"
          class="group flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-[13px] leading-5 transition"
          :class="activeNoteId === note.id ? 'bg-slate-200 text-slate-950' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'"
          :style="{ paddingLeft: `${34 + (level + 1) * 16}px` }"
          type="button"
          @click.stop="emit('selectNote', note.id)"
          @contextmenu.prevent.stop="(e: MouseEvent) => emit('noteContextmenu', note, e)"
        >
          <span
            class="note-drag-handle shrink-0 cursor-grab text-slate-400 transition"
            :class="props.isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
          >
            <ZIcon name="ri:draggable" :size="13" color="currentColor" />
          </span>
          <ZIcon name="ri:file-text-line" :size="14" color="currentColor" class="shrink-0 opacity-80" />
          <span class="min-w-0 flex-1 truncate">{{ note.title }}</span>
        </button>
      </VueDraggable>
    </div>
  </div>
</template>

<script lang="ts">
export default { name: "FileTreeNode" };
</script>
