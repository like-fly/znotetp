<script setup lang="ts">
import { h, onMounted, ref } from "vue";
import { NButton, NCard, NDataTable, NTag, useDialog, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import req from "@/utils/req";
import DocFormDialog from "@/components/dashboard/DocFormDialog.vue";

const dialog = useDialog();
const message = useMessage();
const { t } = useI18n();

const rows = ref<any[]>([]);
const loading = ref(false);
const checkedRowKeys = ref<number[]>([]);

/** 表单对话框状态 */
const formShow = ref(false);
const editingDoc = ref<Record<string, any> | null>(null);

/** 获取文档列表 */
const fetchDocs = async () => {
    loading.value = true;
    try {
        const res = await req.get("/api/admin/doc/list");
        if (res.data?.code === 200) {
            rows.value = res.data.data || [];
        }
    } finally {
        loading.value = false;
    }
};

/** 新增文档 */
const handleCreate = () => {
    editingDoc.value = null;
    formShow.value = true;
};

/** 编辑文档 */
const handleEdit = (doc: Record<string, any>) => {
    editingDoc.value = doc;
    formShow.value = true;
};

/** 表单保存后刷新 */
const handleSaved = () => {
    checkedRowKeys.value = [];
    void fetchDocs();
};

/** 批量删除 */
const handleDelete = () => {
    const count = checkedRowKeys.value.length;
    if (count === 0) return;

    dialog.warning({
        title: t("doc.panel.delete.confirm_title"),
        content: t("doc.panel.delete.confirm_content", { count }),
        positiveText: t("note.dialog.confirm"),
        negativeText: t("note.dialog.cancel"),
        onPositiveClick: async () => {
            const res = await req.post("/api/admin/doc/delete", { ids: [...checkedRowKeys.value] });
            if (res.data?.code !== 200) {
                message.error(t(res.data?.msg || "error"));
                return;
            }
            message.success(t(res.data.msg));
            checkedRowKeys.value = [];
            void fetchDocs();
        },
    });
};

/** 表格列定义 */
const columns = [
    { type: "selection" as const },
    { title: t("doc.panel.col.notebook"), key: "notebook_title" },
    {
        title: t("doc.panel.col.slug"),
        key: "slug",
        width: 140,
        render: (row: any) =>
            h("a", {
                href: `/doc/${row.slug}`,
                target: "_blank",
                class: "text-blue-600 hover:underline cursor-pointer",
            }, `/${row.slug}`),
    },
    {
        title: t("doc.panel.col.title"),
        key: "title",
        render: (row: any) => row.title || row.notebook_title || "-",
    },
    {
        title: t("doc.panel.col.status"),
        key: "status",
        width: 80,
        render: (row: any) => {
            const isActive = row.status === "active";
            return h(NTag, { type: isActive ? "success" : "default" }, {
                default: () => isActive ? t("doc.panel.status.active") : t("doc.panel.status.inactive"),
            });
        },
    },
    {
        title: t("doc.panel.col.actions"),
        key: "actions",
        width: 80,
        fixed: "right" as const,
        render: (row: any) =>
            h(
                NButton,
                { size: "small", onClick: () => handleEdit(row) },
                { default: () => t("doc.panel.edit") },
            ),
    },
];

onMounted(() => {
    void fetchDocs();
});
</script>

<template>
  <div class="p-6">
    <NCard :bordered="false" class="rounded-3xl">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-slate-900">{{ t("doc.panel.title") }}</h2>
        </div>
        <div class="flex gap-2">
          <NButton type="primary" @click="handleCreate">{{ t("doc.panel.create") }}</NButton>
          <NButton :disabled="checkedRowKeys.length === 0" @click="handleDelete">
            {{ t("doc.panel.delete") }}{{ checkedRowKeys.length ? ` (${checkedRowKeys.length})` : "" }}
          </NButton>
        </div>
      </div>
      <NDataTable
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(row: any) => row.id"
        v-model:checked-row-keys="checkedRowKeys"
        :scroll-x="800"
      />
    </NCard>

    <DocFormDialog
      :show="formShow"
      :doc="editingDoc"
      @update:show="(v: boolean) => (formShow = v)"
      @saved="handleSaved"
    />
  </div>
</template>
