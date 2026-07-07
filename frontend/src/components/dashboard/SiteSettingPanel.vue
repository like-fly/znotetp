<template>
    <div class="site-setting flex justify-center p-3 md:p-6">
        <n-card :bordered="false" class="w-full max-w-[640px]">
            <div class="mb-6 text-[18px] font-semibold text-[#222]">{{ t("site_setting.title") }}</div>

            <n-form ref="formRef" label-placement="top" :model="form" :rules="rules">
                <n-form-item :label="t('site_setting.form.site_title')" path="title">
                    <n-input
                        v-model:value="form.title"
                        :placeholder="t('site_setting.form.site_title.placeholder')"
                        maxlength="100"
                    />
                </n-form-item>

                <n-form-item :label="t('site_setting.form.sub_title')">
                    <n-input
                        v-model:value="form.sub_title"
                        :placeholder="t('site_setting.form.sub_title.placeholder')"
                        maxlength="100"
                    />
                </n-form-item>

                <n-form-item :label="t('site_setting.form.keywords')">
                    <n-input
                        v-model:value="form.keywords"
                        :placeholder="t('site_setting.form.keywords.placeholder')"
                        maxlength="200"
                    />
                </n-form-item>

                <n-form-item :label="t('site_setting.form.description')">
                    <n-input
                        v-model:value="form.description"
                        type="textarea"
                        :autosize="{ minRows: 2, maxRows: 4 }"
                        :placeholder="t('site_setting.form.description.placeholder')"
                        maxlength="500"
                    />
                </n-form-item>

                <n-form-item :label="t('site_setting.form.custom_header')">
                    <n-input
                        v-model:value="form.custom_header"
                        type="textarea"
                        :autosize="{ minRows: 3, maxRows: 8 }"
                        :placeholder="t('site_setting.form.custom_header.placeholder')"
                    />
                </n-form-item>
            </n-form>

            <div class="mt-6 flex justify-start">
                <n-button
                    type="primary"
                    :loading="submitting"
                    @click="handleSubmit"
                >
                    {{ t("site_setting.form.save") }}
                </n-button>
            </div>
        </n-card>
    </div>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from "vue";
import type { FormInst, FormRules } from "naive-ui";
import { useI18n } from "vue-i18n";
import req from "@/utils/req";
import { useSiteStore } from "@/stores/site";

const { t } = useI18n();
const message = useMessage();
const siteStore = useSiteStore();
const formRef = ref<FormInst | null>(null);
const submitting = ref(false);
const loading = ref(false);

const form = reactive({
    title: "",
    sub_title: "",
    keywords: "",
    description: "",
    custom_header: "",
});

const rules: FormRules = {
    title: [{ required: true, message: () => t("site_setting.form.title_required"), trigger: "blur" }],
};

// 加载已有配置
const loadSetting = async () => {
    loading.value = true;
    try {
        const res = await req.get("/api/admin/get_setting", {
            params: { key: "site_setting" },
        });
        const result = res.data;
        if (result?.code === 200 && result?.data) {
            const data = result.data;
            form.title = data.title || "";
            form.sub_title = data.sub_title || "";
            form.keywords = data.keywords || "";
            form.description = data.description || "";
            form.custom_header = data.custom_header || "";
        }
    } catch {
        // 首次加载无数据时忽略错误
    } finally {
        loading.value = false;
    }
};

// 保存配置
const handleSubmit = async () => {
    try {
        await formRef.value?.validate();
    } catch {
        return;
    }

    submitting.value = true;
    try {
        const res = await req.post("/api/admin/set_setting", {
            key: "site_setting",
            value: {
                title: form.title.trim(),
                sub_title: form.sub_title.trim(),
                keywords: form.keywords.trim(),
                description: form.description.trim(),
                custom_header: form.custom_header.trim(),
            },
        });
        const result = res.data;
        if (result?.code === 200) {
            // 保存成功后立即同步全局标题，避免当前后台和其它页面继续显示旧值。
            siteStore.setSiteSetting({
                title: form.title.trim(),
                sub_title: form.sub_title.trim(),
            });
            document.title = siteStore.siteTitle;
            message.success(t("site_setting.save.success"));
        } else {
            message.error(result?.msg || t("site_setting.save.failed"));
        }
    } catch {
        message.error(t("site_setting.save.failed"));
    } finally {
        submitting.value = false;
    }
};

onMounted(() => {
    loadSetting();
});
</script>

<style scoped>
.site-setting {
    min-height: 100%;
}
</style>
