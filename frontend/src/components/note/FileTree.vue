<script setup lang="ts">
import { computed, provide, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { NInput, NModal, useMessage } from "naive-ui";
import { VueDraggable } from "vue-draggable-plus";
import ZIcon from "@/components/DynamicIcon.vue";
import FileTreeNode from "@/components/note/FileTreeNode.vue";
import NoteContextMenu, { type NoteContextAction } from "@/components/note/NoteContextMenu.vue";
import MoveDialog from "@/components/note/dialogs/MoveDialog.vue";
import ShareDialog from "@/components/note/dialogs/ShareDialog.vue";
import { useNoteStore } from "@/stores/note";
import type { Note, NotebookNode } from "@/types/note";

const { t } = useI18n();
const message = useMessage();
const noteStore = useNoteStore();

const props = defineProps<{
    tree: NotebookNode[];
    activeCategoryId: number | null;
    activeNoteId: number | null;
    isMobile: boolean;
}>();

const emit = defineEmits<{
    (e: "selectCategory", id: number): void;
    (e: "selectNote", id: number): void;
    (e: "requestDialog", parentId: number, parentName: string): void;
    (e: "contextmenu", node: NotebookNode, event: MouseEvent): void;
    (e: "blankContextmenu", event: MouseEvent): void;
    (e: "blankClick"): void;
}>();

const expandedIds = ref<Set<number>>(new Set());
const toggleExpand = (nodeId: number) => {
    const next = new Set(expandedIds.value);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    expandedIds.value = next;
};
provide("fileTreeExpand", { expandedIds, toggleExpand });

type DragKind = "category" | "note" | null;
type DragSession = {
    kind: DragKind;
    id: number | null;
};
const dragSession = ref<DragSession>({
    kind: null,
    id: null,
});
const setDragging = (kind: DragKind, id: number | null = null) => {
    dragSession.value = {
        kind,
        id,
    };
};
provide("fileTreeDrag", { dragSession, setDragging });

const setDraggingFromElement = (kind: Exclude<DragKind, null>, element: HTMLElement) => {
    const raw = kind === "category" ? element.dataset.categoryId : element.dataset.noteId;
    const id = Number(raw);
    setDragging(kind, Number.isFinite(id) ? id : null);
};

watch(
    () => [noteStore.activeCategoryId, noteStore.activeNoteId] as const,
    ([id, noteId]) => {
        if (id === null || noteId === null) return;
        expandedIds.value = new Set([...expandedIds.value, id]);
    },
    { immediate: true },
);

watch(
    () => noteStore.activeNotebookId,
    (id) => {
        if (id !== null && !noteStore.loadedCategoryIds.has(id)) {
            void noteStore.loadCategoryNotes(id);
        }
    },
    { immediate: true },
);

const menuShow = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const menuNote = ref<Note | null>(null);
const showMoveDialog = ref(false);
const moveNote = ref<Note | null>(null);
const shareDialogShow = ref(false);
const shareNoteId = ref(0);
const shareNoteTitle = ref("");
const showRenameDialog = ref(false);
const renameValue = ref("");
const renameNote = ref<Note | null>(null);

const currentCategoryTree = computed(() => noteStore.activeNotebook?.children ?? []);
const rootNotes = computed(() => {
    const rootId = noteStore.activeNotebookId;
    if (rootId === null || noteStore.searchMode || noteStore.trashMode) return [];
    return noteStore.notesByCategory[rootId] ?? [];
});
const localTree = ref<NotebookNode[]>([]);
const localRootNotes = ref<Note[]>([]);
const rootCategoryGroup = { name: "file-tree-categories", pull: true, put: ["file-tree-categories"] };
const rootNoteGroup = { name: "file-tree-notes", pull: true, put: ["file-tree-notes"] };
const isLoading = computed(() => noteStore.loading.tree || noteStore.loading.search || noteStore.loading.trash);
const resultNotes = computed(() => {
    if (noteStore.trashMode) return noteStore.trashNotes;
    if (noteStore.searchMode) return noteStore.searchResults;
    return [];
});
const resultTitle = computed(() => noteStore.trashMode ? t("note.trash.title") : t("note.note.search.results"));
const emptyText = computed(() => noteStore.trashMode ? t("note.trash.empty") : t("note.note.search.no_results"));

watch(
    () => props.tree,
    (tree) => { localTree.value = [...tree]; },
    { immediate: true },
);

watch(
    () => rootNotes.value,
    (notes) => { localRootNotes.value = [...notes]; },
    { immediate: true },
);

const handleNoteContextMenu = (note: Note, event: MouseEvent) => {
    menuNote.value = note;
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    menuShow.value = true;
};

const handleMenuSelect = async (action: NoteContextAction, note: Note) => {
    if (action === "rename") {
        renameNote.value = note;
        renameValue.value = note.title;
        showRenameDialog.value = true;
        return;
    }
    if (action === "open_new_window") {
        window.open(`/app/note/${note.id}`, "_blank");
        return;
    }
    if (action === "trash") {
        await noteStore.deleteNote(note.id);
        message.success(t("note.context.trash.success"));
        return;
    }
    if (action === "permanent_delete") {
        await noteStore.permanentDeleteNote(note.id);
        message.success(t("note.context.permanent_delete.success"));
        return;
    }
    if (action === "move") {
        moveNote.value = note;
        showMoveDialog.value = true;
        return;
    }
    if (action === "share") {
        shareNoteId.value = note.id;
        shareNoteTitle.value = note.title;
        shareDialogShow.value = true;
        return;
    }
    if (action === "disable_vectorize") {
        await noteStore.updateNote(note.id, { allow_vectorize: 0 }, false);
        message.success(t("note.context.disable_vectorize.success"));
        return;
    }
    if (action === "enable_vectorize") {
        await noteStore.updateNote(note.id, { allow_vectorize: 1 }, false);
        message.success(t("note.context.enable_vectorize.success"));
        return;
    }
    const next = note.is_pinned === 1 ? 0 : 1;
    await noteStore.updateNote(note.id, { is_pinned: next });
    message.success(next === 1 ? t("note.context.pin.success") : t("note.context.unpin.success"));
};

const handleConfirmRename = async () => {
    if (!renameNote.value || !renameValue.value.trim()) return;
    const result = await noteStore.updateNote(renameNote.value.id, { title: renameValue.value.trim() });
    if (result) {
        message.success(t("note.category.rename.success"));
    }
    showRenameDialog.value = false;
};

const handleMoveConfirm = async (targetId: number) => {
    if (!moveNote.value) return;
    const result = await noteStore.moveNote(moveNote.value.id, targetId);
    if (!result) {
        message.error(t("note.move.failed"));
    }
    showMoveDialog.value = false;
};

const rootCategoryItems = () => localTree.value.map((node, idx) => ({ id: node.id, sort_order: idx }));
const rootNoteItems = () => localRootNotes.value.map((note, idx) => ({ id: note.id, sort_order: idx }));

type SortableMoveEvent = {
    item?: HTMLElement;
    related?: HTMLElement;
    originalEvent?: DragEvent | MouseEvent;
};

const pointerInsideFolderDropTrigger = (event: SortableMoveEvent) => {
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

const canMoveRootCategory = (event: SortableMoveEvent) => !pointerInsideFolderDropTrigger(event);

const rollbackRootCategories = async () => {
    localTree.value = [...props.tree];
    await noteStore.silentRefreshTree();
};

const rollbackRootNotes = async () => {
    localRootNotes.value = [...rootNotes.value];
    await noteStore.silentRefreshCategoryNotes();
};

const handleRootCategorySort = async () => {
    if (noteStore.activeNotebookId === null) return;
    const result = await noteStore.sortNotebooks(rootCategoryItems(), noteStore.activeNotebookId);
    if (!result) {
        await rollbackRootCategories();
        message.error(t("notebook.sort.failed"));
    }
};

const handleRootCategoryAdd = async (event: SortableMoveEvent) => {
    if (noteStore.activeNotebookId === null || !event.item) {
        await rollbackRootCategories();
        return;
    }
    const categoryId = Number(event.item.dataset.categoryId);
    const newIndex = localTree.value.findIndex((node) => node.id === categoryId);
    if (!Number.isFinite(categoryId) || newIndex < 0) {
        await rollbackRootCategories();
        return;
    }
    const items = rootCategoryItems();
    const moved = await noteStore.moveCategory(categoryId, noteStore.activeNotebookId, newIndex);
    if (!moved) {
        await rollbackRootCategories();
        message.error(t("note.move.failed"));
        return;
    }
    const result = await noteStore.sortNotebooks(items, noteStore.activeNotebookId);
    if (!result) {
        await rollbackRootCategories();
        message.error(t("notebook.sort.failed"));
    }
};

const handleRootNoteSort = async () => {
    if (noteStore.activeNotebookId === null) return;
    const result = await noteStore.sortNotes(rootNoteItems(), noteStore.activeNotebookId);
    if (!result) {
        await rollbackRootNotes();
        message.error(t("note.sort.failed"));
    }
};

const handleRootNoteAdd = async (event: SortableMoveEvent) => {
    if (noteStore.activeNotebookId === null || !event.item) {
        await rollbackRootNotes();
        return;
    }
    const noteId = Number(event.item.dataset.noteId);
    const newIndex = localRootNotes.value.findIndex((note) => note.id === noteId);
    if (!Number.isFinite(noteId) || newIndex < 0) {
        await rollbackRootNotes();
        return;
    }
    const items = rootNoteItems();
    const moved = await noteStore.moveNote(noteId, noteStore.activeNotebookId, newIndex);
    if (!moved) {
        await rollbackRootNotes();
        message.error(t("note.move.failed"));
        return;
    }
    const result = await noteStore.sortNotes(items, noteStore.activeNotebookId);
    if (!result) {
        await rollbackRootNotes();
        message.error(t("note.sort.failed"));
    }
};

const handleBlankClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-file-tree-item="true"]')) return;
    emit("blankClick");
};
</script>

<template>
  <div class="flex h-full flex-col bg-[#f7f7f5]" @click="handleBlankClick" @contextmenu.prevent="(e: MouseEvent) => emit('blankContextmenu', e)">
    <div class="flex-1 overflow-y-auto px-2 py-2">
      <div v-if="isLoading" class="py-8 text-center text-xs text-slate-400">Loading...</div>

      <template v-else-if="noteStore.searchMode || noteStore.trashMode">
        <div class="mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-2 px-1 text-xs text-slate-500">
          <ZIcon :name="noteStore.trashMode ? 'ri:delete-bin-line' : 'ri:search-line'" :size="13" color="currentColor" />
          <span>{{ resultTitle }}</span>
          <span class="text-slate-400">({{ resultNotes.length }})</span>
        </div>
        <button
          v-for="note in resultNotes"
          :key="note.id"
          data-file-tree-item="true"
          class="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px] leading-5 transition"
          :class="activeNoteId === note.id ? 'bg-slate-200 text-slate-950' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'"
          type="button"
          @click="emit('selectNote', note.id)"
          @contextmenu.prevent.stop="(e: MouseEvent) => handleNoteContextMenu(note, e)"
        >
          <ZIcon name="ri:file-text-line" :size="14" color="currentColor" class="shrink-0 opacity-80" />
          <span class="min-w-0 flex-1 truncate">{{ note.title }}</span>
          <span v-if="noteStore.searchMode" class="max-w-[96px] truncate text-[11px] opacity-60">{{ noteStore.getCategoryName(note.notebook_id) }}</span>
        </button>
        <div v-if="resultNotes.length === 0" class="px-3 py-8 text-center text-xs text-slate-400">{{ emptyText }}</div>
      </template>

      <template v-else>
        <VueDraggable
          v-model="localRootNotes"
          :class="['min-h-1', dragSession.kind === 'note' ? 'min-h-6 py-1' : '']"
          :animation="150"
          :disabled="noteStore.loading.save"
          :group="rootNoteGroup"
          handle=".note-drag-handle"
          @start="(e: { item: HTMLElement }) => setDraggingFromElement('note', e.item)"
          @end="setDragging(null)"
          @update="handleRootNoteSort"
          @add="handleRootNoteAdd"
        >
          <button
            v-for="note in localRootNotes"
            :key="`root-${note.id}`"
            :data-note-id="note.id"
            data-file-tree-item="true"
            class="group flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-[13px] leading-5 transition"
            :class="activeNoteId === note.id ? 'bg-slate-200 text-slate-950' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'"
            style="padding-left: 18px"
            type="button"
            @click="emit('selectNote', note.id)"
            @contextmenu.prevent.stop="(e: MouseEvent) => handleNoteContextMenu(note, e)"
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

        <VueDraggable
          v-model="localTree"
          :class="['min-h-1', dragSession.kind === 'category' ? 'min-h-6 py-1' : '']"
          :animation="150"
          :disabled="noteStore.loading.save"
          :group="rootCategoryGroup"
          :move="canMoveRootCategory"
          handle=".drag-handle"
          @start="(e: { item: HTMLElement }) => setDraggingFromElement('category', e.item)"
          @end="setDragging(null)"
          @update="handleRootCategorySort"
          @add="handleRootCategoryAdd"
        >
          <FileTreeNode
            v-for="node in localTree"
            :key="node.id"
            :node="node"
            :active-category-id="activeCategoryId"
            :active-note-id="activeNoteId"
            :level="0"
            :is-mobile="props.isMobile"
            @select-category="(id: number) => emit('selectCategory', id)"
            @select-note="(id: number) => emit('selectNote', id)"
            @request-dialog="(pid: number, pname: string) => emit('requestDialog', pid, pname)"
            @contextmenu="(n: NotebookNode, e: MouseEvent) => emit('contextmenu', n, e)"
            @note-contextmenu="handleNoteContextMenu"
          />
        </VueDraggable>
        <div v-if="props.tree.length === 0" class="px-3 py-8 text-center text-xs text-slate-400">{{ t('note.category.empty') }}</div>
      </template>
    </div>

    <NoteContextMenu
      v-model:show="menuShow"
      :x="menuX"
      :y="menuY"
      :note="menuNote"
      @select="handleMenuSelect"
    />

    <MoveDialog
      v-model:show="showMoveDialog"
      type="note"
      :source-id="moveNote?.id ?? 0"
      :source-name="moveNote?.title ?? ''"
      :notebook-tree="currentCategoryTree"
      :current-category-id="moveNote?.notebook_id ?? undefined"
      @confirm="handleMoveConfirm"
      @cancel="showMoveDialog = false"
    />

    <ShareDialog
      v-model:show="shareDialogShow"
      :note-id="shareNoteId"
      :note-title="shareNoteTitle"
    />

    <NModal
      v-model:show="showRenameDialog"
      preset="dialog"
      :title="t('note.category.context.rename')"
      :positive-text="t('note.dialog.confirm')"
      :negative-text="t('note.dialog.cancel')"
      :mask-closable="false"
      @positive-click="handleConfirmRename"
      @negative-click="showRenameDialog = false"
    >
      <NInput
        v-model:value="renameValue"
        :placeholder="t('note.category.rename.placeholder')"
        autofocus
        @keydown.enter="handleConfirmRename"
      />
    </NModal>
  </div>
</template>
