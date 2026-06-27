<script setup lang="ts">
/**
 * 导出笔记对话框
 *
 * 确认后调用 GET /api/user/export?notebook_id=xxx
 * 成功则触发浏览器下载 ZIP 文件
 */
import { ref, watch } from "vue";
import { NModal, NSpin, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import req from "@/utils/req";

const { t } = useI18n();
const message = useMessage();

const props = defineProps<{
    show: boolean;
    /** 笔记本 ID */
    notebookId: number | null;
    /** 笔记本名称（用于提示和文件名） */
    notebookName: string;
}>();

const emit = defineEmits<{
    (e: "update:show", value: boolean): void;
}>();

/** 导出进行中 */
const exporting = ref(false);

/** 弹窗打开时重置状态 */
watch(
    () => props.show,
    (val) => {
        if (val) {
            exporting.value = false;
        }
    },
);

/** 关闭弹窗 */
const handleClose = () => {
    if (exporting.value) return;
    emit("update:show", false);
};

/** 开始导出 */
const handleExport = async () => {
    if (!props.notebookId) return;

    exporting.value = true;
    try {
        const res = await req.get(`/api/user/export`, {
            params: { notebook_id: props.notebookId },
            responseType: "blob",
        });

        // 创建下载链接
        const url = URL.createObjectURL(res.data);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${props.notebookName}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        message.success(t("export.success"));
        emit("update:show", false);
    } catch (err: any) {
        // 如果后端返回 JSON 错误，尝试解析
        if (err?.response?.data instanceof Blob) {
            try {
                const text = await err.response.data.text();
                const json = JSON.parse(text);
                message.error(t(json.msg) || t("export.failed"));
            } catch {
                message.error(t("export.failed"));
            }
        } else {
            message.error(t("export.failed"));
        }
    } finally {
        exporting.value = false;
    }
};
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('export.title')"
    class="max-w-md"
    :mask-closable="!exporting"
    :close-on-esc="!exporting"
    @update:show="handleClose"
  >
    <!-- 确认提示 -->
    <div class="flex flex-col items-center gap-4 py-4">
      <p class="text-center text-sm text-slate-600">
        {{ t("export.confirm", { name: notebookName }) }}
      </p>
    </div>

    <!-- 底部按钮 -->
    <template #footer>
      <div class="flex justify-end gap-2">
        <button
          class="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="exporting"
          @click="handleClose"
        >
          {{ t("note.dialog.cancel") }}
        </button>
        <button
          class="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="exporting"
          @click="handleExport"
        >
          <NSpin v-if="exporting" :size="14" :stroke-width="14" />
          {{ t("export.start") }}
        </button>
      </div>
    </template>
  </NModal>
</template>
