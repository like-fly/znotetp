<script setup lang="ts">
/**
 * 绗旇宸ヤ綔鍙颁富椤甸潰
 *
 * 涓夋爮甯冨眬锛圕ol-1 / Col-2 瀹藉害鍙嫋鎷斤紝鎸佷箙鍖栧埌 localStorage锛夛細
 *   Col-1锛氱敤鎴蜂俊鎭?+ 绗旇鏈笅鎷?+ "鎴戠殑绗旇"鏍囬鏍?+ 鍒嗙被鏍? *   Col-2锛氭悳绱?+ 鏂板缓绗旇 + 绗旇鍒楄〃
 *   Col-3锛坒lex-1锛夛細绗旇鏍囬 + 鍏冧俊鎭?+ Markdown 缂栬緫鍣? *
 * 鏍稿績鐘舵€佺敱 stores/note.ts 缁熶竴绠＄悊锛屾湰缁勪欢鍙礋璐ｇ紪鎺掑拰浜嬩欢杞彂銆? */
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NButton, NDropdown, NPopconfirm, NSpin, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import UserHeader from "@/components/note/UserHeader.vue";
import NotebookSwitcher from "@/components/note/NotebookSwitcher.vue";
import CategoryTree from "@/components/note/CategoryTree.vue";
import FileTree from "@/components/note/FileTree.vue";
import NoteOutline from "@/components/note/NoteOutline.vue";
import NoteList from "@/components/note/NoteList.vue";
import ShareList from "@/components/note/ShareList.vue";
import NoteEditor from "@/components/note/NoteEditor.vue";
import NoteMetaBar from "@/components/note/NoteMetaBar.vue";
import CreateNotebookDialog from "@/components/note/dialogs/CreateNotebookDialog.vue";
import ImportDialog from "@/components/note/dialogs/ImportDialog.vue";
import ExportDialog from "@/components/note/dialogs/ExportDialog.vue";
import MoveDialog from "@/components/note/dialogs/MoveDialog.vue";
import DeleteNotebookDialog from "@/components/note/dialogs/DeleteNotebookDialog.vue";
import VersionHistoryDialog from "@/components/note/dialogs/VersionHistoryDialog.vue";
import ChangePasswordDialog from "@/components/note/dialogs/ChangePasswordDialog.vue";
import CategoryContextMenu from "@/components/note/CategoryContextMenu.vue";
import { useNoteStore } from "@/stores/note";
import { useUserStore } from "@/stores/user";
import { useSiteStore } from "@/stores/site";
import { useNoteSync } from "@/composables/useNoteSync";
import { fetchNoteVersion } from "@/api/note";
import { NModal, NInput, NAlert } from "naive-ui";
import AIView from "@/views/AIView.vue";
import type { NotebookNode } from "@/types/note";
import type { CategoryContextAction } from "@/components/note/CategoryContextMenu.vue";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const message = useMessage();
const noteStore = useNoteStore();
const userStore = useUserStore();
const siteStore = useSiteStore();

type SidebarTab = "files" | "outline";
type NoteOutlineItem = { level: number; text: string; index: number };
type EditorMode = "ir" | "sv";

const isAdmin = computed(() => userStore.userInfo.role === "admin");
const appName = computed(() => siteStore.siteTitle || siteStore.appInfo.app_name || "ZNoteTP");
const appSubtitle = computed(() => siteStore.siteSubtitle || "Markdown Workspace");

const fileMenuOptions = computed(() => {
    const options: Array<Record<string, unknown>> = [
        {
            label: t("note.user.change_password"),
            key: "change_password",
            icon: () => h(ZIcon, { name: "ri:lock-password-line", size: 16 }),
        },
    ];
    if (isAdmin.value) {
        options.push({
            label: t("note.user.back_dashboard"),
            key: "dashboard",
            icon: () => h(ZIcon, { name: "ri:dashboard-line", size: 16 }),
        });
    }
    options.push(
        { type: "divider", key: "d-user" },
        {
            label: t("note.shares.title"),
            key: "shares",
            icon: () => h(ZIcon, { name: "ri:share-forward-line", size: 16 }),
        },
        {
            label: t("note.trash.title"),
            key: "trash",
            icon: () => h(ZIcon, { name: "ri:delete-bin-line", size: 16 }),
        },
        { type: "divider", key: "d-data" },
        {
            label: t("import.title"),
            key: "import",
            icon: () => h(ZIcon, { name: "ri:upload-line", size: 16 }),
        },
        {
            label: t("export.title"),
            key: "export",
            icon: () => h(ZIcon, { name: "ri:download-line", size: 16 }),
        },
        { type: "divider", key: "d-logout" },
        {
            label: t("note.user.logout"),
            key: "logout",
            icon: () => h(ZIcon, { name: "ri:logout-box-line", size: 16 }),
        },
    );
    return options;
});
const fileAreaMenuOptions = computed(() => [
    {
        label: "新建文件",
        key: "create_note",
        disabled: noteStore.activeNotebookId === null || noteStore.searchMode || noteStore.trashMode,
        icon: () => h(ZIcon, { name: "ri:sticky-note-add-line", size: 16 }),
    },
    {
        label: "新建文件夹",
        key: "create_folder",
        disabled: noteStore.activeNotebookId === null || noteStore.searchMode || noteStore.trashMode,
        icon: () => h(ZIcon, { name: "ri:folder-add-line", size: 16 }),
    },
]);
const editorMenuOptions = computed(() => [
    {
        label: "段落",
        key: "paragraph",
        children: [
            { label: "一级标题", key: "heading_1" },
            { label: "二级标题", key: "heading_2" },
            { label: "三级标题", key: "heading_3" },
            { label: "四级标题", key: "heading_4" },
            { label: "五级标题", key: "heading_5" },
            { label: "六级标题", key: "heading_6" },
        ],
    },
    {
        label: "插入图片",
        key: "insert_image",
    },
    {
        label: "插入表格",
        key: "insert_table",
    },
]);
const editorMenuProps = () => ({
    style: "min-width: 188px;",
});

// ==================== 绉诲姩绔娴?====================

/** 鏄惁涓虹Щ鍔ㄧ瑙嗗彛锛堚墹768px锛?*/
const isMobile = ref(false);
const mediaQuery = window.matchMedia?.("(max-width: 768px)");
if (mediaQuery) {
    isMobile.value = mediaQuery.matches;
    const onMediaChange = (e: MediaQueryListEvent) => { isMobile.value = e.matches; };
    mediaQuery.addEventListener("change", onMediaChange);
    onBeforeUnmount(() => mediaQuery.removeEventListener("change", onMediaChange));
}

/** 绉诲姩绔晶杈规爮鎶藉眽寮€鍏?*/
const drawerOpen = ref(false);

// ==================== 璺敱鍚屾 ====================

/**
 * 鐩戝惉璺敱 noteId 鍙傛暟锛屽悓姝ュ埌 store锛堟祻瑙堝櫒鍓嶈繘/鍚庨€€锛? * 涓嶄娇鐢?immediate锛岄灞忕敱 onMounted 鐨?deep-link 閫昏緫缁熶竴澶勭悊
 */
watch(
    () => route.params.noteId,
    (noteId) => {
        if (noteId) {
            const numId = Number(noteId);
            if (Number.isFinite(numId) && numId !== noteStore.activeNoteId) {
                noteStore.selectNote(numId);
            }
        } else {
            noteStore.selectNote(null);
        }
    },
);

// ==================== 寮圭獥鎺у埗 ====================

/** AI 寮圭獥鏄鹃殣锛堜粎 PC 绔娇鐢級 */
const showAiModal = ref(false);

/**
 * AI 鎸夐挳鐐瑰嚮澶勭悊
 * PC 绔細鎵撳紑寮圭獥
 * 绉诲姩绔細鏂扮獥鍙ｆ墦寮€ /app/ai
 */
const handleAiClick = () => {
    if (isMobile.value) {
        window.open("/app/ai", "_blank");
    } else {
        showAiModal.value = true;
    }
};

/** 鏂板缓绗旇鏈?Dialog 鏄鹃殣 */
const showCreateNotebook = ref(false);
/** 鏂板缓瀛愬垎绫?Dialog 鏄鹃殣 */
const showCreateCategory = ref(false);
/** 淇敼瀵嗙爜 Dialog 鏄鹃殣 */
const showChangePassword = ref(false);
/** 妗岄潰绔乏渚ф爣绛?*/
const activeSidebarTab = ref<SidebarTab>("files");
/** 妗岄潰鎼滅储妗嗘樉闅?*/
const showSearchBox = ref(false);
/** 妗岄潰鎼滅储鍏抽敭璇?*/
const searchKeyword = ref("");
let searchTimer: ReturnType<typeof setTimeout> | null = null;
/** 桌面端编辑器模式；切换笔记时恢复即时渲染。 */
const editorMode = ref<EditorMode>("ir");
/** 瀵煎叆 Dialog 鏄鹃殣 */
const showImportDialog = ref(false);
/** 瀵煎嚭 Dialog 鏄鹃殣 */
const showExportDialog = ref(false);
/** 瀵煎嚭鐩爣淇℃伅 */
const exportTarget = ref<{ id: number; name: string } | null>(null);
/** 鏂板缓瀛愬垎绫绘椂锛屼紶鍏ョ殑鐖跺垎绫讳俊鎭?*/
const newCategoryParent = ref<{ id: number; name: string } | null>(null);

// ==================== 鍒嗙被鍙抽敭鑿滃崟 ====================

/** 鍒嗙被鍙抽敭鑿滃崟鏄鹃殣 */
const categoryMenuShow = ref(false);
/** 鍒嗙被鍙抽敭鑿滃崟浣嶇疆 X */
const categoryMenuX = ref(0);
/** 鍒嗙被鍙抽敭鑿滃崟浣嶇疆 Y */
const categoryMenuY = ref(0);
/** 褰撳墠鍙抽敭鐨勫垎绫昏妭鐐?*/
const categoryMenuNode = ref<NotebookNode | null>(null);
/** 鏂囦欢鍖虹┖鐧藉鍙抽敭鑿滃崟鏄鹃殣 */
const fileAreaMenuShow = ref(false);
/** 鏂囦欢鍖虹┖鐧藉鍙抽敭鑿滃崟浣嶇疆 X */
const fileAreaMenuX = ref(0);
/** 鏂囦欢鍖虹┖鐧藉鍙抽敭鑿滃崟浣嶇疆 Y */
const fileAreaMenuY = ref(0);
/** 编辑器右键菜单显示状态 */
const editorMenuShow = ref(false);
/** 编辑器右键菜单位置 X */
const editorMenuX = ref(0);
/** 编辑器右键菜单位置 Y */
const editorMenuY = ref(0);

/** 閲嶅懡鍚?Dialog 鏄鹃殣 */
const showRenameDialog = ref(false);
/** 閲嶅懡鍚嶈緭鍏ユ鍊?*/
const renameValue = ref("");
/** 閲嶅懡鍚嶇洰鏍囪妭鐐?*/
const renameTarget = ref<NotebookNode | null>(null);

/** 鍒犻櫎鍒嗙被 Dialog 鏄鹃殣 */
const showDeleteDialog = ref(false);
/** 鍒犻櫎鐩爣鑺傜偣 */
const deleteTarget = ref<NotebookNode | null>(null);

/** 閲嶅懡鍚嶅脊绐楁爣棰橈細绗旇鏈敤 notebook 鏍囬锛屽垎绫荤敤 category 鏍囬 */
const renameDialogTitle = computed(() =>
    renameTarget.value?.parent_id === null
        ? t("note.notebook.rename.title")
        : t("note.category.rename.title"),
);

/** 閲嶅懡鍚嶅脊绐楀崰浣嶇 */
const renameDialogPlaceholder = computed(() =>
    renameTarget.value?.parent_id === null
        ? t("note.notebook.rename.placeholder")
        : t("note.category.rename.placeholder"),
);

// ==================== 绉诲姩寮圭獥 ====================

/** 绉诲姩寮圭獥鏄鹃殣 */
const showMoveDialog = ref(false);
/** 绉诲姩绫诲瀷 */
const moveDialogType = ref<"note" | "category">("category");
/** 琚Щ鍔ㄥ疄浣?ID */
const moveSourceId = ref(0);
/** 琚Щ鍔ㄥ疄浣撳悕绉?*/
const moveSourceName = ref("");
/** 闇€瑕佹帓闄ょ殑鐩爣鑺傜偣 ID锛堢Щ鍔ㄥ垎绫绘椂涓鸿嚜韬強瀛愬瓩锛?*/
const moveExcludeIds = ref<number[]>([]);
/** 褰撳墠鎵€鍦ㄥ垎绫?ID锛堥珮浜爣璁帮級 */
const moveCurrentCategoryId = ref<number | null>(null);

// ==================== 鍘嗗彶鐗堟湰鎶藉眽 ====================

/** 鍘嗗彶鐗堟湰鎶藉眽鏄鹃殣 */
const showVersionHistory = ref(false);

// ==================== 鍘嗗彶鐗堟湰鏌ョ湅妯″紡 ====================

/** 鏄惁澶勪簬鍘嗗彶鐗堟湰鏌ョ湅妯″紡锛堟帶鍒躲€愬洖鍒板綋鍓嶃€戞寜閽?+ 璀﹀憡鏉℃樉闅愶級 */
const viewingVersion = ref(false);
/** 褰撳墠鏌ョ湅鐨勭増鏈彿锛堣鍛婃潯灞曠ず鐢級 */
const viewingVersionNo = ref<number | null>(null);
/** 鏈€鍒濈殑瀹為檯鍐呭澶囦唤锛堜粎棣栨杩涘叆鏌ョ湅妯″紡鏃跺瓨锛岀敤浜庡洖鍒板綋鍓嶏級 */
const versionBackup = ref<{ title: string; content: string } | null>(null);

/**
 * 鏌ョ湅鏌愪釜鍘嗗彶鐗堟湰
 * 鎷夊彇璇︽儏 鈫?澶囦唤褰撳墠瀹為檯鍐呭锛堜粎棣栨锛夆啋 鏇挎崲缂栬緫鍣ㄥ唴瀹?鈫?鍏抽棴鎶藉眽
 */
const handleViewVersion = async (versionId: number) => {
    const res = await fetchNoteVersion(versionId);
    if (!res) return;

    // 仅首次进入查看模式时备份当前实际内容，后续切换版本不再重复备份
    if (versionBackup.value === null) {
        versionBackup.value = {
            title: draftTitle.value,
            content: draftContent.value,
        };
    }

    // 鏇挎崲缂栬緫鍣ㄥ唴瀹逛负鍘嗗彶鐗堟湰
    draftTitle.value = res.title;
    draftContent.value = res.content;
    viewingVersionNo.value = res.version_no;
    viewingVersion.value = true;

    // 鍏抽棴鎶藉眽锛屽洖鍒扮紪杈戝櫒棰勮
    showVersionHistory.value = false;
};

/**
 * 鍥炲埌褰撳墠锛氫粠澶囦唤杩樺師缂栬緫鍣ㄥ唴瀹癸紝閫€鍑烘煡鐪嬫ā寮? */
const handleBackToCurrent = () => {
    if (versionBackup.value) {
        draftTitle.value = versionBackup.value.title;
        draftContent.value = versionBackup.value.content;
    }
    versionBackup.value = null;
    viewingVersion.value = false;
    viewingVersionNo.value = null;
};

// ==================== 娓呯┖鍥炴敹绔?====================

/** 娓呯┖鍥炴敹绔欏姞杞界姸鎬?*/
const emptyTrashLoading = ref(false);

/**
 * 娓呯┖鍥炴敹绔? * 璋冪敤 store action 鎵归噺鍒犻櫎鍥炴敹绔欎腑鐨勬墍鏈夌瑪璁? */
const handleEmptyTrash = async () => {
    emptyTrashLoading.value = true;
    try {
        const deleted = await noteStore.emptyTrash();
        if (deleted >= 0) {
            message.success(t("note.trash.empty.success"));
        }
    } finally {
        emptyTrashLoading.value = false;
    }
};

/**
 * 閫掑綊鏀堕泦鑺傜偣鐨勬墍鏈夊瓙瀛?id锛堢敤浜庢瀯寤烘帓闄ゅ垪琛級
 */
const collectDescendantIds = (rootId: number, tree: NotebookNode[]): number[] => {
    for (const node of tree) {
        if (node.id === rootId) {
            const ids: number[] = [node.id];
            const collect = (n: NotebookNode) => {
                for (const child of n.children) {
                    ids.push(child.id);
                    collect(child);
                }
            };
            collect(node);
            return ids;
        }
        if (node.children.length > 0) {
            const found = collectDescendantIds(rootId, node.children);
            if (found.length > 0) return found;
        }
    }
    return [];
};

// ==================== 缂栬緫鍣ㄨ崏绋跨姸鎬?====================

/** 褰撳墠缂栬緫涓殑鏍囬锛堟殏瀛橈紝淇濆瓨鍚庡啓鍥?store锛?*/
const draftTitle = ref("");
/** 褰撳墠缂栬緫涓殑鍐呭锛堟殏瀛橈紝淇濆瓨鍚庡啓鍥?store锛?*/
const draftContent = ref("");
/** 淇濆瓨鎸夐挳 loading 鎬?*/
const isSaving = ref(false);
// ==================== 鑷姩淇濆瓨 ====================

/** 鑷姩淇濆瓨鐘舵€侊細saved 宸蹭繚瀛?/ saving 淇濆瓨涓?/ unsaved 鏈夋湭淇濆瓨鏇存敼 */
const autoSaveStatus = ref<"saved" | "saving" | "unsaved">("saved");
/** 缂栬緫鍣ㄦ槸鍚﹁鐢ㄦ埛婵€娲昏繃锛堢偣鍑?缂栬緫锛夛紝鐢ㄤ簬鎺у埗鑷姩淇濆瓨鐘舵€佹寚绀哄櫒鐨勬樉闅?*/
const editorTouched = ref(false);
/** 鑷姩淇濆瓨闃叉姈瀹氭椂鍣?*/
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
/** 鏍囪鏄惁姝ｅ湪鎵ц鑷姩淇濆瓨锛堥槻姝㈠苟鍙戯級 */
let autoSaving = false;

/** 鎵ц闈欓粯淇濆瓨锛氫笉鍒涘缓鐗堟湰蹇収锛屼粎鎸佷箙鍖栧唴瀹?*/
const performAutoSave = async () => {
    const id = noteStore.activeNoteId;
    if (id === null || autoSaving) return;

    const latestContent = getLatestContent();
    const saved = noteStore.activeNote;
    if (saved && draftTitle.value === saved.title && latestContent === saved.content) {
        autoSaveStatus.value = "saved";
        return;
    }

    autoSaving = true;
    autoSaveStatus.value = "saving";
    try {
        await noteStore.updateNote(id, {
            title: draftTitle.value,
            content: latestContent,
        }, false);
        autoSaveStatus.value = "saved";
    } catch {
        autoSaveStatus.value = "unsaved";
    } finally {
        nextTick(() => { autoSaving = false; });
    }
};

/** 5 绉掗槻鎶栬Е鍙戣嚜鍔ㄤ繚瀛橈紙浠呯紪杈戝櫒琚縺娲诲悗鐢熸晥锛?*/
const scheduleAutoSave = () => {
    // 编辑器未被用户激活时，不触发自动保存，避免切换笔记时误标记未保存
    if (!editorTouched.value) return;

    // 鍐呭鏃犲彉鍖栧垯涓嶆爣"鏈繚瀛?锛岀洿鎺ュ綊 saved
    const latestContent = getLatestContent();
    const saved = noteStore.activeNote;
    if (saved && draftTitle.value === saved.title && latestContent === saved.content) {
        autoSaveStatus.value = "saved";
        return;
    }

    autoSaveStatus.value = "unsaved";
    autoSaveTimer = setTimeout(() => {
        void performAutoSave();
    }, 20000);
};

/** 鐩戝惉鑽夌鍙樺寲锛岃Е鍙戦槻鎶栬嚜鍔ㄤ繚瀛?*/
watch(
    [draftTitle, draftContent],
    () => {
        // 娌℃湁閫変腑绗旇鎴栨鍦ㄦ墜鍔ㄤ繚瀛樻椂锛屼笉瑙﹀彂鑷姩淇濆瓨
        if (noteStore.activeNoteId === null || isSaving.value) return;
        scheduleAutoSave();
    },
);

/** 椤甸潰鍏抽棴/鍒锋柊鏃跺厹搴曚繚瀛橈紙涓嶅垱寤虹増鏈揩鐓э級 */
const handleBeforeUnload = () => {
    if (!hasUnsavedChanges.value || noteStore.activeNoteId === null || isSaving.value) return;
    const token = localStorage.getItem("token");
    fetch("/api/user/notebook/note/update", {
        method: "POST",
        keepalive: true,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
            id: noteStore.activeNoteId,
            title: draftTitle.value,
            content: getLatestContent(),
            create_version: false,
        }),
    });
};

/** 缂栬緫鍣ㄦ槸鍚︽湁鏈繚瀛樹慨鏀光€斺€斿悗鍙拌疆璇㈡嵁姝ゅ垽鏂槸鍚﹁烦杩囨縺娲荤瑪璁板埛鏂?*/
const hasUnsavedChanges = computed(() => {
    if (noteStore.activeNoteId === null) return false;
    const saved = noteStore.activeNote;
    if (!saved) return false;
    return draftTitle.value !== saved.title || draftContent.value !== saved.content;
});

/** 鍚姩鍚庡彴鍚屾锛堟爣绛鹃〉涓嶅彲瑙佹椂 30s 杞锛屽彲瑙佹椂鍋滄锛?*/
useNoteSync(hasUnsavedChanges);

// ==================== 渚ц竟鏍忓彲璋冨搴?====================

/** 绗竴鏍忓搴︼紙px锛夛紝浠?localStorage 鎭㈠ */
const col1Width = ref(300);
/** 绗簩鏍忓搴︼紙px锛夛紝浠?localStorage 鎭㈠ */
const col2Width = ref(380);

/** 瀹藉害绾︽潫锛坧x锛?*/
const COL1_MIN = 200;
const COL1_MAX = 420;
const COL2_MIN = 240;
const COL2_MAX = 520;

/** 闄愬埗瀹藉害鍦ㄥ悎鐞嗚寖鍥村唴 */
const clamp1 = (w: number) => Math.max(COL1_MIN, Math.min(COL1_MAX, w));
const clamp2 = (w: number) => Math.max(COL2_MIN, Math.min(COL2_MAX, w));

/**
 * 寮€濮嬫嫋鎷借皟鏁村垪瀹? * @param col 1 = 绗竴鏍忥紝2 = 绗簩鏍? */
const startResize = (col: 1 | 2, e: MouseEvent) => {
    // 闃叉鎷栨嫿閫変腑鏂囨湰
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const startX = e.clientX;
    const startW = col === 1 ? col1Width.value : col2Width.value;

    const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        if (col === 1) {
            col1Width.value = clamp1(startW + delta);
        } else {
            col2Width.value = clamp2(startW + delta);
        }
    };

    const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // 鎸佷箙鍖栧埌 localStorage
        localStorage.setItem("note-col1-width", String(col1Width.value));
        localStorage.setItem("note-col2-width", String(col2Width.value));
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
};

// ==================== 璁＄畻灞炴€?====================

/** 褰撳墠閫変腑绗旇鏈殑瀛愬垎绫绘爲锛堢敤浜?CategoryTree锛?*/
const currentCategoryTree = computed<NotebookNode[]>(() => {
    return noteStore.activeNotebook?.children ?? [];
});

/** 褰撳墠绗旇鐨勫ぇ绾叉爣棰樺垪琛?*/
const outlineHeadings = computed<NoteOutlineItem[]>(() => {
    const lines = draftContent.value.split(/\r?\n/);
    const headings: NoteOutlineItem[] = [];
    for (const line of lines) {
        const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
        if (!match) continue;
        headings.push({
            level: match[1].length,
            text: match[2].replace(/#+$/, "").trim(),
            index: headings.length,
        });
    }
    return headings;
});

/** 鏄惁鏈夐€変腑鐨勭瑪璁帮紙鐢ㄤ簬绗笁鏍?/ 绉诲姩绔紪杈戝櫒鍒囨崲锛涗粎妫€鏌?activeNoteId锛屽姞杞戒腑鐨?editor 鍖哄睍绀?loading锛?*/
const hasActiveNote = computed(() => noteStore.activeNoteId !== null);

/** 绗旇璇︽儏鏄惁鍔犺浇涓?*/
const noteDetailLoading = computed(() => noteStore.loading.noteDetail);

/** 绗簩鏍忓姞杞界姸鎬侊紙鍥炴敹绔欐ā寮忕敤 trash 鍔犺浇鎬侊紝鍚﹀垯鐢?notes 鍔犺浇鎬侊級 */
const noteListLoading = computed(() => {
    return noteStore.trashMode ? noteStore.loading.trash : noteStore.loading.notes;
});

const formatTime = (val: number | string | null | undefined) => {
    if (!val) return "-";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "-";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const createdText = computed(() => formatTime(noteStore.activeNote?.created_at));
const updatedText = computed(() => formatTime(noteStore.activeNote?.updated_at));

// ==================== 鏁版嵁鍔犺浇 ====================

/**
 * 椤甸潰鎸傝浇鏃讹細
 * 1. 鎭㈠渚ц竟鏍忓搴? * 2. 妫€鏌ョ櫥褰曟€? * 3. 鍔犺浇鐢ㄦ埛淇℃伅
 * 4. 鍔犺浇绗旇鏈爲
 */
onMounted(async () => {
    // 浠?localStorage 鎭㈠鍒楀
    const w1 = localStorage.getItem("note-col1-width");
    const w2 = localStorage.getItem("note-col2-width");
    if (w1) col1Width.value = clamp1(Number(w1));
    if (w2) col2Width.value = clamp2(Number(w2));

    const ok = await userStore.checkLogin();
    if (!ok) return;

    await siteStore.fetchSiteSetting();
    await userStore.getUserInfo();
    await noteStore.loadNotebookTree();

    // Deep-link锛歎RL 甯︽湁 noteId 鏃讹紝鑷姩瀹氫綅鍒版墍灞炲垎绫诲苟浠?API 鍔犺浇绗旇
    if (route.params.noteId) {
        await noteStore.locateAndSelectNote(Number(route.params.noteId));
    }

    // 娉ㄥ唽鍏ㄥ眬蹇嵎閿細Ctrl+S / Cmd+S 淇濆瓨
    window.addEventListener("keydown", handleSaveShortcut);
    // 娉ㄥ唽椤甸潰鍏抽棴/鍒锋柊鏃剁殑鍏滃簳淇濆瓨
    window.addEventListener("beforeunload", handleBeforeUnload);
});

watchEffect(() => {
    const noteTitle = noteStore.activeNote?.title?.trim() || "";
    document.title = noteTitle ? `${noteTitle} - ${appName.value}` : appName.value;
});

/** 缁勪欢鍗歌浇鏃舵竻鐞嗛敭鐩樼洃鍚€佸厹搴曚繚瀛樸€佽嚜鍔ㄤ繚瀛樺畾鏃跺櫒 */
onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleSaveShortcut);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if (searchTimer) clearTimeout(searchTimer);
});

/** 璺敱 query 鍙樺寲鏃舵敮鎸佹繁閾撅紙鍙€夛級 */
watch(
    () => route.query,
    () => {
        // 鍗犱綅锛氭湭鏉ユ敮鎸??note=123 杩欑娣遍摼
    },
);

// ==================== 浜嬩欢澶勭悊 ====================

/** 璺敱璺宠浆锛圲serHeader 鑿滃崟锛?*/
const handleNavigate = (path: string) => {
    void router.push(path);
};

const clearDesktopSearch = () => {
    searchKeyword.value = "";
    showSearchBox.value = false;
    if (searchTimer) {
        clearTimeout(searchTimer);
        searchTimer = null;
    }
    noteStore.clearSearch();
};

const scheduleDesktopSearch = (value: string) => {
    const keyword = value.trim();
    if (searchTimer) clearTimeout(searchTimer);
    if (keyword.length < 3) {
        if (noteStore.searchMode) noteStore.clearSearch();
        return;
    }
    searchTimer = setTimeout(() => {
        void noteStore.searchNotes(keyword);
    }, 300);
};

watch(searchKeyword, scheduleDesktopSearch);

const handleToggleSearch = () => {
    if (showSearchBox.value) {
        clearDesktopSearch();
        return;
    }
    activeSidebarTab.value = "files";
    showSearchBox.value = true;
};

/** 切换即时渲染与 Markdown 原文本模式。 */
const handleToggleEditorMode = () => {
    if (!editorRef.value || noteStore.activeNoteId === null) return;
    const nextMode: EditorMode = editorMode.value === "ir" ? "sv" : "ir";
    editorRef.value.setEditMode?.(nextMode);
    editorMode.value = editorRef.value.getEditMode?.() ?? nextMode;
};

const handleFileMenuSelect = async (key: string) => {
    if (key === "change_password") {
        showChangePassword.value = true;
        return;
    }
    if (key === "dashboard") {
        handleNavigate("/dashboard/home");
        return;
    }
    if (key === "shares") {
        activeSidebarTab.value = "files";
        await handleEnterShares();
        return;
    }
    if (key === "trash") {
        activeSidebarTab.value = "files";
        await handleEnterTrash();
        return;
    }
    if (key === "import") {
        showImportDialog.value = true;
        return;
    }
    if (key === "export") {
        handleExportClick();
        return;
    }
    if (key === "logout") {
        await userStore.logout();
    }
};

/** 鍒囨崲椤跺眰绗旇鏈紙绉诲姩绔悓姝ュ叧闂娊灞夛級 */
const handleSwitchNotebook = (id: number | null) => {
    if (id !== null) {
        noteStore.switchNotebook(id);
        if (isMobile.value) drawerOpen.value = false;
    }
};

/** 鎵撳紑"鏂板缓绗旇鏈?Dialog */
const handleOpenCreateNotebook = () => {
    showCreateNotebook.value = true;
};

/**
 * 璇锋眰鍒犻櫎褰撳墠绗旇鏈紙鐢?NotebookSwitcher 鐨?馃棏 鎸夐挳瑙﹀彂锛? * 澶嶇敤 DeleteNotebookDialog + handleConfirmDelete锛屼笌鍙抽敭鍒犻櫎鍒嗙被璧板悓涓€濂楁祦绋? */
const handleDeleteNotebook = () => {
    const nb = noteStore.activeNotebook;
    if (!nb) return;
    deleteTarget.value = nb;
    showDeleteDialog.value = true;
};

/**
 * 璇锋眰閲嶅懡鍚嶅綋鍓嶇瑪璁版湰锛堢敱 NotebookSwitcher 鏇村鑿滃崟瑙﹀彂锛? * 澶嶇敤 Rename NModal + handleConfirmRename锛屼笌鍙抽敭閲嶅懡鍚嶅垎绫昏蛋鍚屼竴濂楁祦绋? */
const handleRenameNotebook = () => {
    const nb = noteStore.activeNotebook;
    if (!nb) return;
    renameTarget.value = nb;
    renameValue.value = nb.title ?? "";
    showRenameDialog.value = true;
};

/** 鎻愪氦"鏂板缓绗旇鏈? */
const handleConfirmCreateNotebook = async (title: string) => {
    const result = await noteStore.createNotebook({ title, parent_id: null });
    if (result) {
        showCreateNotebook.value = false;
        // 自动切换到新建的笔记本
        noteStore.switchNotebook(result.id);
        showCreateNotebook.value = false;
    }
};

/** 閫変腑鍒嗙被锛堢Щ鍔ㄧ鍚屾鍏抽棴鎶藉眽锛?*/
const handleSelectCategory = async (id: number) => {
    await noteStore.selectCategory(id);
    if (isMobile.value) drawerOpen.value = false;
};

/** 鎵撳紑"鏂板缓瀛愬垎绫?Dialog锛堢敤 Dialog 鏂瑰紡锛岀敱"鎴戠殑绗旇"鏍囬鏍忚Е鍙戯級 */
const handleAddTopCategory = () => {
    if (noteStore.activeNotebookId === null) return;
    const nb = noteStore.activeNotebook;
    if (!nb) return;
    newCategoryParent.value = { id: nb.id, name: nb.title };
    showCreateCategory.value = true;
};

/** 鍒嗙被鑺傜偣鍙抽敭鑿滃崟 */
const handleCategoryContextMenu = (node: NotebookNode, e: MouseEvent) => {
    fileAreaMenuShow.value = false;
    categoryMenuNode.value = node;
    categoryMenuX.value = e.clientX;
    categoryMenuY.value = e.clientY;
    categoryMenuShow.value = true;
};

const handleFileAreaContextMenu = (e: MouseEvent) => {
    categoryMenuShow.value = false;
    fileAreaMenuX.value = e.clientX;
    fileAreaMenuY.value = e.clientY;
    fileAreaMenuShow.value = true;
};

const handleFileAreaMenuSelect = async (key: string) => {
    if (key === "create_note") {
        await handleOpenCreateNote(noteStore.activeNotebookId);
    } else if (key === "create_folder") {
        handleAddTopCategory();
    }
    fileAreaMenuShow.value = false;
};

/** 鍒嗙被鍙抽敭鑿滃崟閫変腑 */
const handleCategoryMenuSelect = (action: CategoryContextAction, node: NotebookNode) => {
    if (action === "create_note") {
        void handleCreateNoteInCategory(node.id);
    } else if (action === "create_folder") {
        openCreateCategoryDialog(node.id, node.title);
    } else if (action === "rename") {
        renameValue.value = node.title;
        renameTarget.value = node;
        showRenameDialog.value = true;
    } else if (action === "move") {
        moveDialogType.value = "category";
        moveSourceId.value = node.id;
        moveSourceName.value = node.title;
        moveExcludeIds.value = collectDescendantIds(node.id, noteStore.notebookTree);
        moveCurrentCategoryId.value = node.id;
        showMoveDialog.value = true;
    } else if (action === "delete") {
        deleteTarget.value = node;
        showDeleteDialog.value = true;
    } else if (action === "export") {
        exportTarget.value = { id: node.id, name: node.title };
        showExportDialog.value = true;
    }
};

/** 鐐瑰嚮椤堕儴瀵煎嚭鎸夐挳 */
const handleExportClick = () => {
    if (noteStore.activeNotebookId === null) return;
    const notebook = noteStore.notebookTree.find((nb) => nb.id === noteStore.activeNotebookId);
    exportTarget.value = {
        id: noteStore.activeNotebookId,
        name: notebook?.title ?? "",
    };
    showExportDialog.value = true;
};

/** 纭閲嶅懡鍚?*/
const handleConfirmRename = async () => {
    if (!renameTarget.value || !renameValue.value.trim()) return;
    const result = await noteStore.updateNotebook(renameTarget.value.id, { title: renameValue.value.trim() });
    if (result) {
        message.success(t("note.category.rename.success"));
    }
    showRenameDialog.value = false;
};

/** 纭鍒犻櫎鍒嗙被 */
const handleConfirmDelete = async () => {
    if (!deleteTarget.value) return;
    const result = await noteStore.deleteNotebooks([deleteTarget.value.id]);
    if (result) {
        message.success(t("note.category.delete.success"));
    }
    showDeleteDialog.value = false;
};

/** 纭绉诲姩 */
const handleMoveConfirm = async (targetId: number) => {
    if (moveDialogType.value === "category") {
        const result = await noteStore.moveCategory(moveSourceId.value, targetId);
        if (!result) {
            message.error(t("note.move.failed"));
        }
    }
    showMoveDialog.value = false;
};

/** 鍙栨秷绉诲姩 */
const handleMoveCancel = () => {
    showMoveDialog.value = false;
};

/** 鎵撳紑"鏂板缓瀛愬垎绫?Dialog锛堢敱 CategoryTree 鑺傜偣 requestDialog 瑙﹀彂锛?*/
const openCreateCategoryDialog = (parentId: number, parentName: string) => {
    newCategoryParent.value = { id: parentId, name: parentName };
    showCreateCategory.value = true;
};

/** 瀹為檯鍒涘缓瀛愬垎绫?*/
const doCreateCategory = async (parentId: number, title: string) => {
    const result = await noteStore.createNotebook({ title, parent_id: parentId });
    if (result) {
        // 选中新建的分类
        await noteStore.selectCategory(result.id);
    }
};
/** 鎻愪氦"鏂板缓瀛愬垎绫? */
const handleConfirmCreateCategory = async (title: string) => {
    if (!newCategoryParent.value) return;
    await doCreateCategory(newCategoryParent.value.id, title);
    showCreateCategory.value = false;
};

const handleCreateNoteInCategory = async (categoryId: number) => {
    if (hasUnsavedChanges.value && noteStore.activeNoteId !== null) {
        await handleSaveNote();
    }
    await noteStore.loadCategoryNotes(categoryId);
    noteStore.activeCategoryId = categoryId;
    const result = await noteStore.createNote({
        notebook_id: categoryId,
        title: t("note.note.untitled"),
        content: "",
    });
    if (result) {
        await noteStore.selectNote(result.id);
        void router.push(`/app/note/${result.id}`);
    }
};

/**
 * 新建笔记（内联方式）
 * 直接创建一个未命名笔记，自动选中，然后聚焦标题让用户改名
 */
const handleOpenCreateNote = async (targetId?: number | null) => {
    const targetNotebookId = targetId ?? noteStore.activeCategoryId ?? noteStore.activeNotebookId;
    if (targetNotebookId === null) {
        message.warning(t("note.note.create.placeholder"));
        return;
    }
    await handleCreateNoteInCategory(targetNotebookId);
};

const handleSelectNote = async (id: number) => {
    if (hasUnsavedChanges.value && noteStore.activeNoteId !== null) {
        await handleSaveNote();
    }
    editorTouched.value = false;
    await noteStore.selectNote(id);
    router.push(`/app/note/${id}`);
};

/**
 * 瀵煎叆鎴愬姛鍚庣殑灞€閮ㄥ埛鏂帮細
 * 閲嶆柊鎷変竴娆?/api/user/notebook/list 鏇存柊鍒嗙被鏍戯紝涓嶉噸杞芥暣椤? * 淇濈暀鐢ㄦ埛褰撳墠閫変腑鐨勭瑪璁版湰/鍒嗙被/绗旇锛坰ilentRefreshTree 鍐呴儴浼氭牎楠屾湁鏁堟€э級
 */
const handleImported = async () => {
    await noteStore.silentRefreshTree();
};

/** 绉诲姩绔繑鍥炵瑪璁板垪琛?*/
const handleMobileBack = () => {
    drawerOpen.value = false;
    router.push('/app');
};

/** 杩涘叆鍥炴敹绔欐ā寮?*/
const handleEnterTrash = async () => {
    await noteStore.enterTrashMode();
    if (isMobile.value) drawerOpen.value = false;
};

/** 杩涘叆鎴戠殑鍒嗕韩妯″紡 */
const handleEnterShares = async () => {
    await noteStore.enterSharesMode();
    if (isMobile.value) drawerOpen.value = false;
};

/**
 * 鍚屾鑽夌鐘舵€? * 鐩戝惉 activeNote 鑰岄潪 activeNoteId锛岄伩鍏?selectNote async 鏈熼棿鎻愬墠 flush 绌虹櫧鏁版嵁
 * 淇濆瓨杩涜涓烦杩囧悓姝ワ紝閬垮厤瑕嗙洊鐢ㄦ埛姝ｅ湪杈撳叆鐨勫唴瀹癸紙瀵艰嚧鍏夋爣璺冲姩锛? */
watch(
    () => noteStore.activeNote,
    (note) => {
        if (isSaving.value || autoSaving) return;
        draftTitle.value = note?.title ?? "";
        draftContent.value = note?.content ?? "";
    },
);

/** NoteEditor 缁勪欢寮曠敤锛堢敤浜庤幏鍙栨渶鏂扮紪杈戝櫒鍐呭锛?*/
const editorRef = ref<(InstanceType<typeof NoteEditor> & {
    scrollToHeading?: (index: number) => void;
    applyHeading?: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
    insertMarkdownAtCursor?: (markdown: string) => void;
    insertMarkdownBelowCurrentLine?: (markdown: string) => void;
    setEditMode?: (mode: EditorMode) => void;
    getEditMode?: () => EditorMode;
}) | null>(null);

/** 每篇笔记均从即时渲染模式开始。 */
watch(
    () => noteStore.activeNoteId,
    async () => {
        editorMode.value = "ir";
        await nextTick();
        editorRef.value?.setEditMode?.("ir");
    },
);

const handleOutlineSelect = (index: number) => {
    editorRef.value?.scrollToHeading?.(index);
};

/** 缂栬緫鍣ㄥ唴瀹瑰彉鏇?鈫?鏆傚瓨鍒拌崏绋匡紝鏍囪缂栬緫鍣ㄥ凡婵€娲?*/
const handleEditorChange = (value: string) => {
    editorTouched.value = true;
    draftContent.value = value;
};

/**
 * 打开编辑器右键菜单。
 */
const handleEditorContextMenu = (event: MouseEvent) => {
    categoryMenuShow.value = false;
    fileAreaMenuShow.value = false;
    editorMenuX.value = event.clientX;
    editorMenuY.value = event.clientY;
    editorMenuShow.value = true;
};

/**
 * 处理编辑器右键菜单动作。
 */
/**
 * 从剪贴板中读取图片 URL，仅读取 http/https 地址。
 */
const readClipboardImageUrl = async (): Promise<string> => {
    if (!navigator.clipboard?.readText) return "";
    try {
        const text = (await navigator.clipboard.readText()).trim();
        return /^https?:\/\/\S+$/i.test(text) ? text : "";
    } catch {
        return "";
    }
};

const handleEditorMenuSelect = async (key: string) => {
    if (!editorRef.value) return;

    if (/^heading_[1-6]$/.test(key)) {
        const level = Number(key.replace("heading_", "")) as 1 | 2 | 3 | 4 | 5 | 6;
        editorRef.value.applyHeading?.(level);
    } else if (key === "insert_image") {
        const imageUrl = await readClipboardImageUrl();
        editorRef.value.insertMarkdownAtCursor?.(`![img](${imageUrl})`);
    } else if (key === "insert_table") {
        editorRef.value.insertMarkdownBelowCurrentLine?.("| 列1 | 列2 |\n| --- | --- |\n| 内容1 | 内容2 |");
    }

    editorMenuShow.value = false;
};

/**
 * 鑾峰彇缂栬緫鍣ㄦ渶鏂板唴瀹? * 鐩存帴浠?Vditor 瀹炰緥鍙栧€硷紝閬垮厤 input 鍥炶皟寤惰繜瀵艰嚧 draftContent 涓嶅悓姝? */
const getLatestContent = (): string => {
    return editorRef.value?.getContent() ?? draftContent.value;
};

/** 淇濆瓨绗旇锛堟爣棰?+ 鍐呭锛夛細鎵嬪姩淇濆瓨锛屽垱寤虹増鏈揩鐓?*/
const handleSaveNote = async () => {
    if (noteStore.activeNoteId === null) return;
    isSaving.value = true;
    // 清除自动保存定时器，防止手动保存期间自动保存被触发
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    try {
        // 直接从编辑器获取最新内容，避免 input 回调延迟导致 draftContent 不同步
        const latestContent = getLatestContent();

        await noteStore.updateNote(noteStore.activeNoteId, {
            title: draftTitle.value,
            content: latestContent,
        });
        // 杞婚噺鎻愮ず
        message.success(t("note.editor.saved"));
        autoSaveStatus.value = "saved";

        // 淇濆瓨鎴愬姛鍚庤嚜鍔ㄩ€€鍑哄巻鍙叉煡鐪嬫ā寮忥紙淇濆瓨鍗冲洖婊氱敓鏁堬紝鍐呭宸叉垚鏂板綋鍓嶆€侊級
        if (viewingVersion.value) {
            versionBackup.value = null;
            viewingVersion.value = false;
            viewingVersionNo.value = null;
        }
    } catch {
        message.error(t("note.editor.save_failed"));
    } finally {
        nextTick(() => { isSaving.value = false; });
    }
};

/**
 * 鍏ㄥ眬蹇嵎閿細Ctrl+S锛圵indows/Linux锛?/ Cmd+S锛坢acOS锛変繚瀛樼瑪璁? * 浠呭湪鏈夐€変腑绗旇鏃剁敓鏁堬紱灞忚斀娴忚鍣ㄩ粯璁ょ殑"鍙﹀瓨涓?寮圭獥
 */
const handleSaveShortcut = (e: KeyboardEvent) => {
    const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !e.shiftKey && !e.altKey;
    if (!isSave) return;
    e.preventDefault();
    if (noteStore.activeNoteId === null || isSaving.value) return;
    void handleSaveNote();
};

</script>

<template>
  <!-- ==================== 妗岄潰绔細Typora 椋庢牸甯冨眬 ==================== -->
  <div v-if="!isMobile" class="flex h-screen w-screen flex-col overflow-hidden bg-white">
    <header class="flex h-14 shrink-0 items-stretch border-b border-slate-200 bg-white text-sm text-slate-800">
      <div
        :style="{ width: col1Width + 'px' }"
        class="flex shrink-0 items-center gap-3 border-r border-slate-200 px-4"
      >
        <img src="/static/images/znote.svg" :alt="appName" class="h-8 w-8 shrink-0" />
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold tracking-[0.18em] text-slate-900">{{ appName }}</div>
          <div class="truncate text-[11px] text-slate-400">{{ appSubtitle }}</div>
        </div>
      </div>

      <div class="flex min-w-0 flex-1 items-center justify-between gap-4 border-r border-slate-200 px-5">
        <div class="flex min-w-0 items-center gap-4 text-xs">
          <div v-if="noteStore.activeNote" class="flex items-center gap-1.5 text-slate-500">
            <ZIcon name="ri:add-circle-line" :size="13" color="#94a3b8" />
            <span class="text-slate-400">{{ t("note.meta.created_at") }}</span>
            <span class="text-slate-700">{{ createdText }}</span>
          </div>
          <div v-if="noteStore.activeNote" class="flex items-center gap-1.5 text-slate-500">
            <ZIcon name="ri:edit-2-line" :size="13" color="#94a3b8" />
            <span class="text-slate-400">{{ t("note.meta.updated_at") }}</span>
            <span class="text-slate-700">{{ updatedText }}</span>
          </div>
          <div v-if="editorTouched && autoSaveStatus === 'saved'" class="flex items-center gap-1 text-emerald-500">
            <ZIcon name="ri:check-line" :size="12" color="currentColor" />
            <span>{{ t("note.editor.auto_saved") }}</span>
          </div>
          <div v-else-if="editorTouched && autoSaveStatus === 'unsaved'" class="flex items-center gap-1 text-amber-500">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>{{ t("note.editor.unsaved") }}</span>
          </div>
          <div v-else-if="editorTouched && autoSaveStatus === 'saving'" class="flex items-center gap-1 text-slate-400">
            <ZIcon name="ri:loader-4-line" :size="11" color="currentColor" class="animate-spin" />
            <span>{{ t("note.editor.auto_saving") }}</span>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <button
            v-if="viewingVersion"
            class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-amber-600 transition hover:bg-amber-50"
            type="button"
            @click="handleBackToCurrent"
          >
            <ZIcon name="ri:arrow-go-back-line" :size="14" color="currentColor" />
            <span>{{ t("note.version.back_to_current") }}</span>
          </button>
          <NInput
            v-if="showSearchBox"
            v-model:value="searchKeyword"
            size="small"
            class="min-w-0 w-48 max-w-[18vw] xl:w-64"
            :placeholder="t('note.note.search.placeholder')"
            clearable
            @keydown.escape="clearDesktopSearch"
          >
            <template #prefix>
              <ZIcon name="ri:search-line" :size="14" color="#94a3b8" />
            </template>
          </NInput>
          <button
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            type="button"
            :title="t('note.note.search.placeholder')"
            @click="handleToggleSearch"
          >
            <ZIcon :name="showSearchBox ? 'ri:close-line' : 'ri:search-line'" :size="17" color="currentColor" />
          </button>
          <button
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded transition disabled:cursor-not-allowed disabled:opacity-40"
            :class="editorMode === 'sv' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'"
            type="button"
            :disabled="noteStore.activeNoteId === null"
            :title="t(editorMode === 'ir' ? 'note.editor.switch_to_source' : 'note.editor.switch_to_ir')"
            @click="handleToggleEditorMode"
          >
            <ZIcon name="ri:code-line" :size="18" color="currentColor" />
          </button>
          <button
            class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            type="button"
            @click="showVersionHistory = true"
          >
            <ZIcon name="ri:history-line" :size="14" color="currentColor" />
            <span>{{ t("note.version.button") }}</span>
          </button>
          <button
            class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="isSaving || noteStore.activeNoteId === null"
            @click="handleSaveNote"
          >
            <ZIcon v-if="!isSaving" name="ri:save-line" :size="14" color="currentColor" />
            <ZIcon v-else name="ri:loader-4-line" :size="14" color="currentColor" class="animate-spin" />
            <span>{{ isSaving ? t("note.editor.saving") : t("note.editor.save") }}</span>
          </button>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2 px-4">
        <button
          class="flex h-8 w-8 items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          type="button"
          :title="t('note.ai.button')"
          @click="handleAiClick"
        >
          <ZIcon name="ri:robot-2-line" :size="18" color="currentColor" />
        </button>
        <NDropdown :options="fileMenuOptions" trigger="click" placement="bottom-end" @select="handleFileMenuSelect">
          <button class="flex h-8 w-8 items-center justify-center rounded transition hover:bg-slate-100" type="button" title="文件">
            <ZIcon name="ri:settings-3-line" :size="17" color="currentColor" />
          </button>
        </NDropdown>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <aside
        :style="{ width: col1Width + 'px' }"
        class="flex shrink-0 flex-col border-r border-slate-200 bg-[#f7f7f5] text-slate-700"
      >
        <div class="grid h-14 shrink-0 grid-cols-2 border-b border-slate-200 bg-[#f7f7f5]">
          <button
            class="relative text-base transition hover:bg-slate-100"
            :class="activeSidebarTab === 'files' ? 'font-semibold text-slate-950' : 'text-slate-500'"
            type="button"
            @click="activeSidebarTab = 'files'"
          >
            文件
            <span v-if="activeSidebarTab === 'files'" class="absolute bottom-0 left-1/2 h-1 w-20 -translate-x-1/2 bg-slate-800" />
          </button>
          <button
            class="relative text-base transition hover:bg-slate-100"
            :class="activeSidebarTab === 'outline' ? 'font-semibold text-slate-950' : 'text-slate-500'"
            type="button"
            @click="activeSidebarTab = 'outline'"
          >
            大纲
            <span v-if="activeSidebarTab === 'outline'" class="absolute bottom-0 left-1/2 h-1 w-20 -translate-x-1/2 bg-slate-800" />
          </button>
        </div>

        <FileTree
          v-if="activeSidebarTab === 'files'"
          :tree="currentCategoryTree"
          :active-category-id="null"
          :active-note-id="noteStore.activeNoteId"
          :is-mobile="isMobile"
          @select-category="handleSelectCategory"
          @select-note="handleSelectNote"
          @request-dialog="(pid: number, pname: string) => openCreateCategoryDialog(pid, pname)"
          @contextmenu="handleCategoryContextMenu"
          @blank-contextmenu="handleFileAreaContextMenu"
        />
        <NoteOutline
          v-else
          :headings="outlineHeadings"
          @select="handleOutlineSelect"
        />
      </aside>

      <div class="resize-handle" @mousedown="(e) => startResize(1, e)" />

      <main class="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <ShareList
          v-if="noteStore.sharesMode"
          :shares="noteStore.myShares"
          :loading="noteStore.loading.shares"
          :is-mobile="isMobile"
          @deleted="handleEnterShares"
        />

        <template v-else-if="noteStore.activeNote">
          <div class="shrink-0 bg-white px-8 pt-4">
            <NAlert
              v-if="viewingVersion"
              type="warning"
              show-icon
              class="mt-2"
              :show-arrow="false"
            >
              {{ t("note.version.viewing_warning", { version: viewingVersionNo }) }}
            </NAlert>
          </div>

          <div class="min-h-0 flex-1 bg-white px-8 pb-6 pt-4" @contextmenu.prevent="handleEditorContextMenu">
            <NoteEditor
              ref="editorRef"
              :model-value="draftContent"
              height="100%"
              @update:model-value="handleEditorChange"
            />
          </div>
        </template>

        <div v-else-if="hasActiveNote && noteDetailLoading" class="flex flex-1 items-center justify-center bg-white">
          <NSpin size="medium" />
        </div>

        <div v-else class="flex flex-1 items-center justify-center bg-white">
          <div class="flex flex-col items-center gap-3 text-center">
            <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <ZIcon name="ri:booklet-line" :size="32" color="#94a3b8" />
            </div>
            <div>
              <p class="text-base font-medium text-slate-700">{{ t("note.empty.workspace.title") }}</p>
              <p class="mt-1 text-sm text-slate-400">{{ t("note.empty.workspace.desc") }}</p>
            </div>
          </div>
        </div>
      </main>
    </div>

    <CategoryContextMenu
      v-model:show="categoryMenuShow"
      :x="categoryMenuX"
      :y="categoryMenuY"
      :node="categoryMenuNode"
      @select="handleCategoryMenuSelect"
    />

    <NDropdown
      placement="bottom-start"
      trigger="manual"
      :show="fileAreaMenuShow"
      :x="fileAreaMenuX"
      :y="fileAreaMenuY"
      :options="fileAreaMenuOptions"
      @select="handleFileAreaMenuSelect"
      @clickoutside="fileAreaMenuShow = false"
    />

    <NDropdown
      placement="bottom-start"
      trigger="manual"
      :show="editorMenuShow"
      :x="editorMenuX"
      :y="editorMenuY"
      :options="editorMenuOptions"
      :menu-props="editorMenuProps"
      @select="handleEditorMenuSelect"
      @clickoutside="editorMenuShow = false"
    />

    <NModal
      v-model:show="showRenameDialog"
      preset="dialog"
      :title="renameDialogTitle"
      :positive-text="t('note.dialog.confirm')"
      :negative-text="t('note.dialog.cancel')"
      :mask-closable="false"
      @positive-click="handleConfirmRename"
      @negative-click="showRenameDialog = false"
    >
      <NInput
        v-model:value="renameValue"
        :placeholder="renameDialogPlaceholder"
        autofocus
        @keydown.enter="handleConfirmRename"
      />
    </NModal>

    <DeleteNotebookDialog
      v-model:show="showDeleteDialog"
      :node="deleteTarget"
      @confirm="handleConfirmDelete"
    />

    <MoveDialog
      v-model:show="showMoveDialog"
      :type="moveDialogType"
      :source-id="moveSourceId"
      :source-name="moveSourceName"
      :notebook-tree="currentCategoryTree"
      :exclude-node-ids="moveExcludeIds"
      :current-category-id="moveCurrentCategoryId ?? undefined"
      @confirm="handleMoveConfirm"
      @cancel="handleMoveCancel"
    />

    <CreateNotebookDialog
      v-model:show="showCreateNotebook"
      :parent-id="null"
      @confirm="handleConfirmCreateNotebook"
    />

    <CreateNotebookDialog
      v-model:show="showCreateCategory"
      :parent-id="newCategoryParent?.id ?? null"
      :parent-name="newCategoryParent?.name"
      @confirm="handleConfirmCreateCategory"
    />

    <ImportDialog
      v-model:show="showImportDialog"
      :notebook-id="noteStore.activeNotebookId"
      @imported="handleImported"
    />

    <ExportDialog
      v-model:show="showExportDialog"
      :notebook-id="exportTarget?.id ?? null"
      :notebook-name="exportTarget?.name ?? ''"
    />

    <VersionHistoryDialog
      v-model:show="showVersionHistory"
      :note-id="noteStore.activeNoteId"
      @view="handleViewVersion"
    />

    <ChangePasswordDialog v-model:show="showChangePassword" />
  </div>

  <!-- ==================== 绉诲姩绔細鍗曟爮鍒囨崲甯冨眬 ==================== -->
  <div v-else class="flex h-screen w-screen flex-col overflow-hidden bg-white pt-[48px]">
    <!-- 椤堕儴瀵艰埅鏍忥紙鍥哄畾锛?-->
    <div class="fixed top-0 left-0 right-0 z-10 flex items-center gap-2 border-b border-slate-200/60 bg-white px-3 py-2">
      <button
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-600 transition hover:bg-slate-100"
        :title="t('note.mobile.menu')"
        @click="drawerOpen = !drawerOpen"
      >
        <ZIcon name="ri:menu-line" :size="20" color="currentColor" />
      </button>
      <button
        v-if="hasActiveNote"
        class="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
        @click="handleMobileBack"
      >
        <ZIcon name="ri:arrow-left-line" :size="18" color="currentColor" />
        <span>{{ t("note.mobile.back") }}</span>
      </button>
      <!-- 绉诲姩绔繚瀛樻寜閽紙鍙充晶锛?-->
      <button
        v-if="hasActiveNote"
        class="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="isSaving"
        :title="t('note.editor.save')"
        @click="handleSaveNote"
      >
        <ZIcon v-if="!isSaving" name="ri:save-line" :size="20" color="currentColor" />
        <ZIcon v-else name="ri:loader-4-line" :size="20" color="currentColor" class="animate-spin" />
      </button>
    </div>

    <!-- 渚ц竟鏍忔娊灞夛紙Teleport 鍒?body 閬垮厤灞傚彔涓婁笅鏂囬棶棰橈級 -->
    <Teleport to="body">
      <div
        class="fixed inset-0 z-50"
        :class="drawerOpen ? 'pointer-events-auto' : 'pointer-events-none'"
      >
        <div class="absolute inset-0 bg-black/40 transition-opacity duration-300" :class="drawerOpen ? 'opacity-100' : 'opacity-0'" @click="drawerOpen = false" />
        <div class="absolute left-0 top-0 bottom-0 flex w-72 flex-col bg-slate-800 text-slate-200 shadow-2xl transition-transform duration-300" :class="drawerOpen ? 'translate-x-0' : '-translate-x-full'">
          <div class="flex items-center justify-between border-b border-slate-700/60 px-3 py-3">
            <span class="text-sm font-medium">{{ appName }}</span>
            <button
              class="rounded p-1 text-slate-400 transition hover:bg-slate-700/50 hover:text-slate-200"
              @click="drawerOpen = false"
            >
              <ZIcon name="ri:close-line" :size="18" color="currentColor" />
            </button>
          </div>
          <div class="border-b border-slate-700/60 p-3">
            <UserHeader @navigate="(path: string) => { drawerOpen = false; handleNavigate(path); }" />
          </div>
          <div class="border-b border-slate-700/60 px-2 py-3">
            <NotebookSwitcher
              :notebooks="noteStore.notebookTree"
              :model-value="noteStore.activeNotebookId"
              @update:model-value="handleSwitchNotebook"
              @create="handleOpenCreateNotebook"
              @rename="handleRenameNotebook"
              @delete="handleDeleteNotebook"
            />
          </div>
          <div class="flex items-center justify-between border-b border-slate-700/60 px-2 py-2">
            <span class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              {{ t("note.category.header") }}
            </span>
            <div class="flex items-center gap-1">
              <button
                class="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-slate-700/60 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="noteStore.activeNotebookId === null"
                :title="t('import.title')"
                @click="showImportDialog = true"
              >
                <ZIcon name="ri:upload-line" :size="14" color="currentColor" />
              </button>
              <button
                class="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-slate-700/60 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="noteStore.activeNotebookId === null"
                :title="t('note.category.add_child')"
                @click="handleAddTopCategory"
              >
                <ZIcon name="ri:add-line" :size="14" color="currentColor" />
              </button>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-2">
            <NSpin v-if="noteStore.loading.tree" class="block py-6" />
            <template v-else>
              <CategoryTree
                :tree="currentCategoryTree"
                :active-id="noteStore.activeCategoryId"
                :is-mobile="isMobile"
                @select="handleSelectCategory"
                @request-dialog="(pid: number, pname: string) => openCreateCategoryDialog(pid, pname)"
                @contextmenu="handleCategoryContextMenu"
              />
              <!-- 鎴戠殑鍒嗕韩鍏ュ彛 -->
              <div class="mt-2 border-t border-slate-700/60 pt-2">
                <div class="flex items-center justify-between rounded px-2 py-1.5">
                  <div
                    class="flex cursor-pointer items-center gap-2 text-sm transition"
                    :class="noteStore.sharesMode ? 'text-blue-300' : 'text-slate-400 hover:text-slate-200'"
                    @click="handleEnterShares"
                  >
                    <ZIcon name="ri:share-forward-line" :size="16" color="currentColor" />
                    <span>{{ t('note.shares.title') }}</span>
                  </div>
                  <span
                    v-if="noteStore.myShares.length > 0"
                    class="inline-flex items-center rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-300"
                  >{{ noteStore.myShares.length }}</span>
                </div>
              </div>
              <!-- 鍥炴敹绔欏叆鍙?-->
              <div class="pt-2">
                <div class="flex items-center justify-between rounded px-2 py-1.5">
                  <div
                    class="flex cursor-pointer items-center gap-2 text-sm transition"
                    :class="noteStore.trashMode ? 'text-blue-300' : 'text-slate-400 hover:text-slate-200'"
                    @click="handleEnterTrash"
                  >
                    <ZIcon name="ri:delete-bin-line" :size="16" color="currentColor" />
                    <span>{{ t('note.trash.title') }}</span>
                  </div>
                  <NPopconfirm
                    v-show="noteStore.trashMode"
                    :disabled="noteStore.trashNotes.length === 0 || emptyTrashLoading"
                    @positive-click="handleEmptyTrash"
                  >
                    <template #trigger>
                      <NButton
                        type="error"
                        size="tiny"
                        :loading="emptyTrashLoading"
                        :disabled="noteStore.trashNotes.length === 0"
                      >
                        {{ t("note.trash.empty.button") }}
                      </NButton>
                    </template>
                    {{ t("note.trash.empty.confirm") }}
                  </NPopconfirm>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 绗旇鍒楄〃瑙嗗浘锛堟棤閫変腑绗旇鏃讹級 -->
    <div v-if="!hasActiveNote" class="flex flex-1 flex-col overflow-hidden">
      <ShareList
        v-if="noteStore.sharesMode"
        :shares="noteStore.myShares"
        :loading="noteStore.loading.shares"
        :is-mobile="isMobile"
        @deleted="handleEnterShares"
      />
      <NoteList
        v-else
        :notes="noteStore.displayedNotes"
        :active-id="noteStore.activeNoteId"
        :loading="noteListLoading"
        :disabled-create="noteStore.activeNotebookId === null || noteStore.trashMode"
        :trash-mode="noteStore.trashMode"
        :is-mobile="isMobile"
        @select="handleSelectNote"
        @create="handleOpenCreateNote"
      />
    </div>

    <!-- 缂栬緫鍣ㄨ鍥撅紙鏈夐€変腑绗旇鏃讹級 -->
    <main v-else class="flex flex-1 flex-col overflow-hidden bg-white">
      <template v-if="noteStore.activeNote">
        <div class="shrink-0 bg-white px-4 py-3">
          <NoteMetaBar
            :note="noteStore.activeNote"
            :saving="isSaving"
            :viewing-version="viewingVersion"
            :auto-save-status="editorTouched ? autoSaveStatus : undefined"
            :mobile="true"
            @save="handleSaveNote"
            @history="showVersionHistory = true"
            @back-to-current="handleBackToCurrent"
          />
          <NAlert
            v-if="viewingVersion"
            type="warning"
            show-icon
            class="mt-2"
            :show-arrow="false"
          >
            {{ t("note.version.viewing_warning", { version: viewingVersionNo }) }}
          </NAlert>
        </div>
        <div class="flex-1 bg-white px-4 pb-4 pt-0" style="min-height:0" @contextmenu.prevent="handleEditorContextMenu">
          <NoteEditor
            ref="editorRef"
            :model-value="draftContent"
            height="100%"
            @update:model-value="handleEditorChange"
          />
        </div>
      </template>
      <!-- 绗旇鍔犺浇涓?-->
      <div v-else-if="hasActiveNote && noteDetailLoading" class="flex flex-1 items-center justify-center bg-white">
        <NSpin size="medium" />
      </div>
      <div v-else class="flex flex-1 items-center justify-center bg-white">
        <div class="flex flex-col items-center gap-3 text-center">
          <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <ZIcon name="ri:booklet-line" :size="32" color="#94a3b8" />
          </div>
          <div>
            <p class="text-base font-medium text-slate-700">{{ t("note.empty.workspace.title") }}</p>
            <p class="mt-1 text-sm text-slate-400">{{ t("note.empty.workspace.desc") }}</p>
          </div>
        </div>
      </div>
    </main>

    <!-- ==================== Dialogs ==================== -->
    <CategoryContextMenu
      v-model:show="categoryMenuShow"
      :x="categoryMenuX"
      :y="categoryMenuY"
      :node="categoryMenuNode"
      @select="handleCategoryMenuSelect"
    />

    <NDropdown
      placement="bottom-start"
      trigger="manual"
      :show="editorMenuShow"
      :x="editorMenuX"
      :y="editorMenuY"
      :options="editorMenuOptions"
      :menu-props="editorMenuProps"
      @select="handleEditorMenuSelect"
      @clickoutside="editorMenuShow = false"
    />

    <NModal
      v-model:show="showRenameDialog"
      preset="dialog"
      :title="renameDialogTitle"
      :positive-text="t('note.dialog.confirm')"
      :negative-text="t('note.dialog.cancel')"
      :mask-closable="false"
      @positive-click="handleConfirmRename"
      @negative-click="showRenameDialog = false"
    >
      <NInput
        v-model:value="renameValue"
        :placeholder="renameDialogPlaceholder"
        autofocus
        @keydown.enter="handleConfirmRename"
      />
    </NModal>
    <DeleteNotebookDialog
      v-model:show="showDeleteDialog"
      :node="deleteTarget"
      @confirm="handleConfirmDelete"
    />
    <MoveDialog
      v-model:show="showMoveDialog"
      :type="moveDialogType"
      :source-id="moveSourceId"
      :source-name="moveSourceName"
      :notebook-tree="currentCategoryTree"
      :exclude-node-ids="moveExcludeIds"
      :current-category-id="moveCurrentCategoryId ?? undefined"
      @confirm="handleMoveConfirm"
      @cancel="handleMoveCancel"
    />
    <CreateNotebookDialog
      v-model:show="showCreateNotebook"
      :parent-id="null"
      @confirm="handleConfirmCreateNotebook"
    />
    <CreateNotebookDialog
      v-model:show="showCreateCategory"
      :parent-id="newCategoryParent?.id ?? null"
      :parent-name="newCategoryParent?.name"
      @confirm="handleConfirmCreateCategory"
    />
    <ImportDialog
      v-model:show="showImportDialog"
      :notebook-id="noteStore.activeNotebookId"
    />
    <VersionHistoryDialog
      v-model:show="showVersionHistory"
      :note-id="noteStore.activeNoteId"
      @view="handleViewVersion"
    />
  </div>

  <!-- ==================== AI 鎮诞鎸夐挳 ==================== -->
  <button
    v-if="isMobile"
    class="ai-float-btn"
    :title="t('note.ai.button')"
    @click="handleAiClick"
  >
    <ZIcon name="ri:robot-2-line" :size="26" color="currentColor" />
  </button>

  <!-- ==================== AI 寮圭獥锛堜粎 PC 绔級 ==================== -->
  <NModal
    v-if="!isMobile"
    v-model:show="showAiModal"
    :auto-focus="false"
    :mask-closable="true"
    :close-on-esc="true"
    display-directive="show"
    class="ai-modal"
    :style="{ width: '80vw', height: '75vh', maxWidth: '1200px', maxHeight: '900px', borderRadius: '16px' }"
  >
    <div class="ai-modal-content">
      <AIView />
    </div>
  </NModal>
</template>

<style scoped>
/* 鎷栨嫿鎶婃墜锛氫袱鏍忎箣闂村悇鏀句竴涓紝4px 瀹?   瑙嗚瀹屽叏閫忔槑锛屼粎闈?cursor: col-resize 鎻愮ず鍙嫋鎷?*/
.resize-handle {
  width: 2px;
  cursor: col-resize;
  flex-shrink: 0;
  background: transparent;
}
/* AI 鎮诞鎸夐挳锛氬浐瀹氬湪鍙充笅瑙?*/
.ai-float-btn {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  padding: 0;
  border: none;
  background: #ffffff;
  color: #3B6EA8;
  cursor: pointer;
  transition: color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 4px 16px rgba(59, 110, 168, 0.3);
  border-radius: 50%;
}
.ai-float-btn:hover {
  color: #2d5a8a;
  transform: scale(1.1);
  box-shadow: 0 6px 24px rgba(59, 110, 168, 0.45);
}
.ai-float-btn:active {
  transform: scale(0.95);
  box-shadow: 0 2px 8px rgba(59, 110, 168, 0.3);
}

/* AI 寮圭獥锛氱Щ闄ら粯璁?padding锛屽渾瑙掗€傞厤 */
:deep(.ai-modal) {
  border-radius: 16px !important;
  overflow: hidden;
}
:deep(.ai-modal .n-modal) {
  border-radius: 16px !important;
  overflow: hidden;
}
:deep(.ai-modal .n-modal-body) {
  padding: 0 !important;
  height: 100%;
}
:deep(.ai-modal .n-modal-body-wrapper) {
  padding: 0 !important;
  height: 100%;
}

/* AI 寮圭獥鍐呭瀹瑰櫒锛氳鐩?AIView 鐨勮鍙ｉ珮搴?*/
.ai-modal-content {
  height: 100%;
  overflow: hidden;
}
.ai-modal-content :deep(> div) {
  height: 100% !important;
  max-height: 100% !important;
}
</style>


