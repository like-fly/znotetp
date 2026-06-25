<script setup lang="ts">
/**
 * ZIP 导入笔记对话框
 *
 * 支持点击或拖拽上传 .zip 文件（最大 10MB）
 * 提交后调用 POST /api/user/import，成功则刷新页面
 */
import { ref, watch } from "vue";
import { NModal, NSpin, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import ZIcon from "@/components/DynamicIcon.vue";
import req from "@/utils/req";

const { t } = useI18n();
const message = useMessage();

const props = defineProps<{
    show: boolean;
    /** 目标笔记本 ID */
    notebookId: number | null;
}>();

const emit = defineEmits<{
    (e: "update:show", value: boolean): void;
}>();

/** 隐藏的文件选择框 */
const fileInputRef = ref<HTMLInputElement | null>(null);
/** 已选文件 */
const selectedFile = ref<File | null>(null);
/** 导入进行中 */
const importing = ref(false);

/** 弹窗打开时重置状态 */
watch(
    () => props.show,
    (val) => {
        if (val) {
            selectedFile.value = null;
            importing.value = false;
        }
    },
);

/** 关闭弹窗 */
const handleClose = () => {
    if (importing.value) return;
    emit("update:show", false);
};

/** 校验文件 */
const validateFile = (file: File): boolean => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
        message.error(t("import.invalid_format"));
        return false;
    }
    if (file.size > 10 * 1024 * 1024) {
        message.error(t("import.file_too_large"));
        return false;
    }
    return true;
};

/** 选择文件（click 触发） */
const handleFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && validateFile(file)) {
        selectedFile.value = file;
    }
    // 清空 input 以便重复选同一文件
    input.value = "";
};

/** 拖拽放下 */
const handleDrop = (e: DragEvent) => {
    const file = e.dataTransfer?.files?.[0];
    if (file && validateFile(file)) {
        selectedFile.value = file;
    }
};

/** 点击上传区域触发文件选择 */
const triggerFileInput = () => {
    fileInputRef.value?.click();
};

/** 格式化文件大小 */
const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
};

/** 开始导入 */
const handleImport = async () => {
    if (!selectedFile.value || !props.notebookId) return;

    importing.value = true;
    try {
        const formData = new FormData();
        formData.append("notebook_id", String(props.notebookId));
        formData.append("file", selectedFile.value);

        const res = await req.post("/api/user/import", formData);
        if (res.data?.code === 200) {
            message.success(t("import.success"));
            emit("update:show", false);
            // 延迟刷新，让用户看到成功提示
            setTimeout(() => location.reload(), 800);
        } else {
            message.error(res.data?.msg || t("import.failed"));
        }
    } catch {
        message.error(t("import.failed"));
    } finally {
        importing.value = false;
    }
};
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('import.title')"
    class="max-w-md"
    :mask-closable="!importing"
    :close-on-esc="!importing"
    @update:show="handleClose"
  >
    <!-- 上传区域 -->
    <div
      class="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 transition hover:border-blue-400 hover:bg-blue-50/50"
      @click="triggerFileInput"
      @dragover.prevent
      @dragenter.prevent
      @drop.prevent="handleDrop"
    >
      <ZIcon name="ri:upload-cloud-2-line" :size="40" color="#94a3b8" />
      <div class="text-center text-sm">
        <p class="text-slate-600">{{ t("import.upload_hint") }}</p>
        <p class="mt-1 text-xs text-slate-400">{{ t("import.file_limit") }}</p>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept=".zip"
      hidden
      @change="handleFileChange"
    />

    <!-- 已选文件信息 -->
    <div
      v-if="selectedFile"
      class="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
    >
      <ZIcon name="ri:file-zip-line" :size="18" color="#64748b" />
      <span class="flex-1 truncate text-sm text-slate-700">{{ selectedFile.name }}</span>
      <span class="shrink-0 text-xs text-slate-400">{{ formatSize(selectedFile.size) }}</span>
    </div>

    <!-- 底部按钮 -->
    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          class="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="importing"
          @click="handleClose"
        >
          {{ t("note.dialog.cancel") }}
        </button>
        <button
          class="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!selectedFile || importing"
          @click="handleImport"
        >
          <NSpin v-if="importing" :size="14" stroke-width="14" />
          {{ t("import.start") }}
        </button>
      </div>
    </template>
  </NModal>
</template>
