<script setup lang="ts">
/**
 * 信息弹窗
 *
 * 功能：
 * 1. 展示ZNoteTP简介
 * 2. 提供反馈链接和帮助文档链接
 * 3. 展示QQ群和微信群信息
 */
import { useI18n } from "vue-i18n";
import { NModal } from "naive-ui";
import ZIcon from "@/components/DynamicIcon.vue";

const { t } = useI18n();

const props = defineProps<{
    show: boolean;
}>();

const emit = defineEmits<{
    (e: "update:show", value: boolean): void;
}>();

/** 关闭弹窗 */
const handleClose = () => {
    emit("update:show", false);
};
</script>

<template>
  <NModal
    :show="show"
    class="max-w-md"
    :mask-closable="true"
    :close-on-esc="true"
    @update:show="handleClose"
  >
    <div class="space-y-5 rounded-2xl bg-white p-5 shadow-xl">
      <!-- ZNoteTP简介 -->
      <div>
        <h3 class="text-lg font-semibold text-slate-800 mb-4 text-center">{{ t('note.info.title') }}</h3>
        <p class="text-sm text-slate-600 leading-relaxed">
          {{ t('note.info.description') }}
        </p>
      </div>

      <!-- 分隔线 -->
      <div class="border-t border-slate-200"></div>

      <!-- 链接区域 -->
      <div class="flex items-center justify-center gap-4 text-sm">
        <a
          href="https://github.com/like-fly/znotetp/issues"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 text-blue-600 transition hover:text-blue-800"
        >
          <ZIcon name="ri:feedback-line" :size="16" color="currentColor" />
          <span>{{ t('note.info.feedback') }}</span>
        </a>
        <span class="text-slate-300">｜</span>
        <a
          href="https://znote.xphub.dev/doc/guide"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 text-blue-600 transition hover:text-blue-800"
        >
          <ZIcon name="ri:book-2-line" :size="16" color="currentColor" />
          <span>{{ t('note.info.help_doc') }}</span>
        </a>
        <span class="text-slate-300">｜</span>
        <a
          href="https://github.com/like-fly/znotetp"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 text-blue-600 transition hover:text-blue-800"
        >
          <ZIcon name="ri:github-line" :size="16" color="currentColor" />
          <span>{{ t('note.info.github') }}</span>
        </a>
      </div>

      <!-- 分隔线 -->
      <div class="border-t border-slate-200"></div>

      <!-- 交流群区域 -->
      <div>
        <h4 class="text-sm font-medium text-slate-700 mb-3 text-center">
          {{ t('note.info.community') }}
        </h4>
        
        <!-- QQ群 -->
        <div class="flex items-center justify-center gap-2 mb-4">
          <ZIcon name="ri:qq-line" :size="18" color="#12B7F5" />
          <span class="text-sm text-slate-600">
            {{ t('note.info.qq_group') }}：<span class="font-medium text-slate-800">253828849</span>
          </span>
        </div>

        <!-- 微信群二维码 -->
        <div class="flex flex-col items-center gap-2">
          <div class="mt-1 rounded-lg border border-slate-200 p-2 bg-white">
            <img
              src="https://dwz.ovh/znote-w"
              :alt="t('note.info.wechat_qrcode')"
              class="w-48 h-48 object-contain"
            />
          </div>
          <p class="text-xs text-slate-400">{{ t('note.info.wechat_scan') }}</p>
        </div>
      </div>

      <!-- 关闭按钮 -->
      <div class="flex justify-center pt-2">
        <button
          class="rounded-md border border-slate-200 bg-white px-6 py-1.5 text-sm text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          @click="handleClose"
        >
          {{ t("note.dialog.close") }}
        </button>
      </div>
    </div>
  </NModal>
</template>
