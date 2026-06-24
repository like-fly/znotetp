<script setup lang="ts">
/**
 * 第二栏：笔记列表
 *
 * 顶部：搜索框（前端按标题过滤）+ 新建笔记按钮
 * 主体：笔记卡片列表（来自 store.displayedNotes）
 * 空态：友好提示
 *
 * 右键笔记项可弹出 NoteContextMenu 菜单，调用 store action
 * 完成移入回收站 / 置顶笔记（智能切换），列表自动刷新。
 */
import { computed, ref } from "vue";
import { NInput, NSpin, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import NoteListItem from "@/components/note/NoteListItem.vue";
import NoteContextMenu, { type NoteContextAction } from "@/components/note/NoteContextMenu.vue";
import { useNoteStore } from "@/stores/note";
import type { Note } from "@/types/note";

const { t } = useI18n();
const message = useMessage();
const noteStore = useNoteStore();

const props = defineProps<{
    notes: Note[];
    activeId: number | null;
    loading: boolean;
    /** 是否禁用"新建笔记"按钮（如未选中分类时） */
    disabledCreate?: boolean;
}>();

const emit = defineEmits<{
    (e: "select", id: number): void;
    (e: "create"): void;
}>();

/** 搜索关键词 */
const keyword = ref("");

/** 过滤后的笔记列表（标题模糊匹配） */
const filteredNotes = computed(() => {
    const kw = keyword.value.trim().toLowerCase();
    if (!kw) return props.notes;
    return props.notes.filter((n) => n.title.toLowerCase().includes(kw));
});

// ==================== 右键菜单状态 ====================

/** 菜单是否显示 */
const menuShow = ref(false);
/** 菜单横坐标 */
const menuX = ref(0);
/** 菜单纵坐标 */
const menuY = ref(0);
/** 当前右键的笔记 */
const menuNote = ref<Note | null>(null);

/** 右键笔记项时：记录坐标并打开菜单 */
const handleContextMenu = (note: Note, e: MouseEvent) => {
    menuNote.value = note;
    menuX.value = e.clientX;
    menuY.value = e.clientY;
    menuShow.value = true;
};

/**
 * 菜单选中操作时：调用对应 store action
 * - trash：软删除后从本地缓存移除，store 内部已处理选中态清空
 * - pin：智能切换 is_pinned 0/1，更新后本地缓存自动同步
 */
const handleMenuSelect = async (action: NoteContextAction, note: Note) => {
    if (action === "trash") {
        await noteStore.deleteNote(note.id);
        message.success(t("note.context.trash.success"));
        return;
    }
    // pin：智能切换置顶状态
    const next = note.is_pinned === 1 ? 0 : 1;
    await noteStore.updateNote(note.id, { is_pinned: next });
    message.success(next === 1 ? t("note.context.pin.success") : t("note.context.unpin.success"));
};
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 顶部工具栏：搜索 + 新建 -->
    <div class="flex shrink-0 items-center gap-2 border-b border-slate-200/60 bg-white px-3 py-2.5">
      <NInput
        v-model:value="keyword"
        :placeholder="t('note.note.search.placeholder')"
        size="small"
        clearable
      >
        <template #prefix>
          <ZIcon name="ri:search-line" :size="14" color="#94a3b8" />
        </template>
      </NInput>
      <button
        class="flex h-8 shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 text-sm text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="disabledCreate"
        @click="emit('create')"
      >
        <ZIcon name="ri:add-line" :size="14" color="currentColor" />
        <span class="hidden sm:inline">{{ t("note.note.create.button") }}</span>
      </button>
    </div>

    <!-- 列表主体 -->
    <div class="flex-1 overflow-y-auto bg-[#f7f8fa] p-3">
      <NSpin v-if="loading" class="block py-12" />

      <!-- 列表 -->
      <div v-else-if="filteredNotes.length > 0" class="space-y-2">
        <NoteListItem
          v-for="note in filteredNotes"
          :key="note.id"
          :note="note"
          :active="activeId === note.id"
          @select="(id: number) => emit('select', id)"
          @contextmenu="handleContextMenu"
        />
      </div>

      <!-- 空态 -->
      <div
        v-else
        class="flex h-full flex-col items-center justify-center gap-3 py-16 text-center"
      >
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <ZIcon name="ri:sticky-note-line" :size="28" color="#94a3b8" />
        </div>
        <div>
          <p class="text-sm font-medium text-slate-600">{{ t("note.note.empty.title") }}</p>
          <p class="mt-1 text-xs text-slate-400">{{ t("note.note.empty.desc") }}</p>
        </div>
      </div>
    </div>

    <!-- 笔记右键菜单：通过 manual 触发 + x/y 定位 -->
    <NoteContextMenu
      v-model:show="menuShow"
      :x="menuX"
      :y="menuY"
      :note="menuNote"
      @select="handleMenuSelect"
    />
  </div>
</template>
