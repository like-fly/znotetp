<script setup lang="ts">
/**
 * ZNoteTP 产品落地页
 *
 * 三大区块：
 *   1. 顶部 Nav：彩色 Logo + 登录/注册/我的笔记/GitHub（登录态感知）
 *   2. Hero：渐变光晕背景 + 主标题 + 双 CTA（系统未初始化时引导到 /user/init）
 *   3. Features：12 个特性卡片（玻璃拟态 + hover 抬升），lg 下 4 列 4-4-4
 *   4. Footer：版权 + 开源链接 + tagline
 */
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { NDrawer, NDrawerContent, NQrCode } from "naive-ui";
import { useSystemStore } from "@/stores/system";
import { useSiteStore } from "@/stores/site";
import { useUserStore } from "@/stores/user";
import req from "@/utils/req";
import ZIcon from "@/components/DynamicIcon.vue";

const { t, locale } = useI18n();
const router = useRouter();
const systemStore = useSystemStore();
const siteStore = useSiteStore();
const userStore = useUserStore();
const appName = computed(() => siteStore.siteTitle || systemStore.status.app_name || "ZNoteTP");

// ==================== 移动端检测 ====================

const isMobile = ref(false);
const mediaQuery = window.matchMedia?.("(max-width: 768px)");
if (mediaQuery) {
    isMobile.value = mediaQuery.matches;
    const onMediaChange = (e: MediaQueryListEvent) => {
        isMobile.value = e.matches;
    };
    mediaQuery.addEventListener("change", onMediaChange);
    onBeforeUnmount(() => mediaQuery.removeEventListener("change", onMediaChange));
}

// ==================== 特性数据 ====================

// Android APK 下载地址（PC 端用作二维码内容，移动端用作直接跳转链接）
const ANDROID_DOWNLOAD_URL = "https://dwz.ovh/znote-app";

interface FeatureItem {
    icon: string;
    titleKey: string;
    descKey: string;
}

const features: FeatureItem[] = [
    { icon: "ri:booklet-line",        titleKey: "home.features.pure.title",     descKey: "home.features.pure.desc" },
    { icon: "ri:markdown-line",       titleKey: "home.features.markdown.title", descKey: "home.features.markdown.desc" },
    { icon: "ri:server-line",         titleKey: "home.features.selfhost.title", descKey: "home.features.selfhost.desc" },
    { icon: "ri:shield-keyhole-line", titleKey: "home.features.private.title",  descKey: "home.features.private.desc" },
    { icon: "ri:robot-2-line",        titleKey: "home.features.ai.title",       descKey: "home.features.ai.desc" },
    { icon: "ri:global-line",         titleKey: "home.features.web.title",      descKey: "home.features.web.desc" },
    { icon: "ri:drag-move-2-line",    titleKey: "home.features.sort.title",     descKey: "home.features.sort.desc" },
    { icon: "ri:file-zip-line",       titleKey: "home.features.import.title",   descKey: "home.features.import.desc" },
    { icon: "ri:history-line",        titleKey: "home.features.version.title",  descKey: "home.features.version.desc" },
    { icon: "ri:team-line",           titleKey: "home.features.multiuser.title", descKey: "home.features.multiuser.desc" },
    { icon: "ri:file-text-line",      titleKey: "home.features.doc.title",      descKey: "home.features.doc.desc" },
    { icon: "ri:share-box-line",      titleKey: "home.features.share.title",    descKey: "home.features.share.desc" },
];

// ==================== 登录态 ====================

/** 登录态判定：仅看 sessionStorage 缓存的 userInfo，避免触发 /api/user/check_login 在首页的重定向副作用 */
const isLoggedIn = computed(() => !!userStore.userInfo.username);

// ==================== CTA 逻辑 ====================

/** Hero 主按钮文案：未初始化显示「初始化系统」，已初始化显示「立即开始」/「我的笔记」 */
const primaryCtaLabel = computed(() => {
    if (!systemStore.status.initialized) {
        return t("home.hero.init_system");
    }
    return isLoggedIn.value ? t("home.nav.notes") : t("home.nav.login");
});

/** Hero 主按钮跳转目标 */
const primaryCtaPath = computed(() => {
    if (!systemStore.status.initialized) return "/user/init";
    return isLoggedIn.value ? "/app" : "/user/login";
});

// ==================== 导航菜单数据 ====================

interface NavLinkItem {
    id: string;
    labelKey: string;
    icon: string;
}

/** 顶部导航锚点链接（桌面端显示全部；移动端折叠进汉堡） */
const navLinks: NavLinkItem[] = [
    { id: "features",  labelKey: "home.nav.features", icon: "ri:star-line" },
    { id: "mobile-app", labelKey: "home.nav.app",     icon: "ri:smartphone-line" },
    { id: "contact",   labelKey: "home.nav.contact",  icon: "ri:chat-3-line" },
];

// ==================== 抽屉（移动端汉堡菜单） ====================

const drawerVisible = ref(false);

/** 打开汉堡菜单 */
const openDrawer = () => {
    drawerVisible.value = true;
};

/** 关闭汉堡菜单 */
const closeDrawer = () => {
    drawerVisible.value = false;
};

// ==================== 滚动 ====================

/** 平滑滚动到指定 section */
const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

/** 点击 nav 锚点链接：移动端先关闭抽屉再滚动 */
const handleNavClick = (id: string) => {
    closeDrawer();
    // 等待抽屉关闭动画完成后再滚动，避免视觉抖动
    setTimeout(() => scrollToSection(id), 50);
};

/** Hero 区域「了解更多」CTA：滚动到特性区 */
const scrollToFeatures = () => scrollToSection("features");

// ==================== 退出登录 ====================

/** 退出登录（drawer 内使用） */
const handleLogout = async () => {
    closeDrawer();
    await userStore.logout();
};

// ==================== 挂载 ====================

onMounted(() => {
    void systemStore.fetchStatus();
    void siteStore.fetchSiteSetting();
    const token = localStorage.getItem("token");
    if (token) {
        req.get("/api/user/check_login").then((res) => {
            if (res.data?.code === 200) {
                userStore.getUserInfo();
                // 已登录用户访问首页时自动跳转到应用
                router.replace("/app");
            }
        });
    }
});

watchEffect(() => {
    document.title = appName.value;
});
</script>

<template>
  <div class="relative min-h-screen overflow-x-clip bg-slate-950 text-slate-100">
    <!-- ==================== 顶部导航 ==================== -->
    <nav
      class="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-950/70 backdrop-blur-md"
    >
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <!-- 左侧 Logo（纯彩色图标，无背景框） -->
        <router-link to="/" class="flex items-center gap-2 transition hover:opacity-80">
          <ZIcon name="ri:booklet-line" :size="26" color="#60a5fa" class="text-blue-400" />
          <span class="text-lg font-semibold tracking-tight">{{ appName }}</span>
        </router-link>

        <!-- 右侧操作区 -->
        <div class="flex items-center gap-2 sm:gap-3">
          <!-- 桌面端：锚点链接 + 登录/笔记（紧贴一组） -->
          <div class="hidden items-center gap-1 sm:flex sm:gap-2">
            <!-- 锚点链接：特性 / APP / 交流群 -->
            <button
              v-for="link in navLinks"
              :key="link.id"
              class="btn-text-plain"
              @click="scrollToSection(link.id)"
            >
              {{ t(link.labelKey) }}
            </button>

            <!-- 分组分隔 -->
            <span class="mx-1 hidden h-4 w-px bg-slate-700/60 sm:inline-block" aria-hidden="true" />

            <!-- 已登录：显示「我的笔记」 -->
            <template v-if="isLoggedIn">
              <button class="btn-base btn-primary btn-md" @click="router.push('/app')">
                <ZIcon name="ri:edit-box-line" :size="16" color="currentColor" />
                <span>{{ t("home.nav.notes") }}</span>
              </button>
            </template>

            <!-- 未登录：仅显示登录按钮 -->
            <template v-else>
              <button class="btn-text-plain" @click="router.push('/user/login')">
                {{ t("home.nav.login") }}
              </button>
            </template>
          </div>

          <!-- GitHub 图标按钮（全端可见） -->
          <a
            href="https://github.com/like-fly/znotetp"
            target="_blank"
            rel="noopener noreferrer"
            :title="t('home.nav.github')"
            :aria-label="t('home.nav.github')"
            class="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:scale-105 hover:bg-slate-800/70 hover:text-white active:scale-95"
          >
            <ZIcon name="ri:github-fill" :size="26" color="currentColor" />
          </a>

          <!-- 移动端：汉堡按钮 -->
          <button
            class="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:scale-105 hover:bg-slate-800/70 hover:text-white active:scale-95 sm:hidden"
            :title="t('home.nav.menu')"
            :aria-label="t('home.nav.menu')"
            @click="openDrawer"
          >
            <ZIcon name="ri:menu-line" :size="26" color="currentColor" />
          </button>
        </div>
      </div>
    </nav>

    <!-- ==================== 移动端汉堡抽屉 ==================== -->
    <NDrawer v-model:show="drawerVisible" :width="280" placement="right">
      <NDrawerContent
        :closable="false"
        :native-scrollbar="false"
        class="!bg-slate-950 !text-slate-100"
      >
        <div class="flex h-full flex-col">
          <!-- 抽屉头部：Logo + 关闭 -->
          <div class="mb-6 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <ZIcon name="ri:booklet-line" :size="24" color="#60a5fa" class="text-blue-400" />
              <span class="text-lg font-semibold tracking-tight">{{ appName }}</span>
            </div>
            <button
              class="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800/70 hover:text-white"
              :aria-label="t('home.nav.menu')"
              @click="closeDrawer"
            >
              <ZIcon name="ri:close-line" :size="22" color="currentColor" />
            </button>
          </div>

          <!-- 锚点链接组 -->
          <div class="flex flex-col">
            <button
              v-for="link in navLinks"
              :key="link.id"
              class="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-200 transition hover:bg-slate-800/60 hover:text-white"
              @click="handleNavClick(link.id)"
            >
              <ZIcon :name="link.icon" :size="20" color="currentColor" class="text-slate-400" />
              <span>{{ t(link.labelKey) }}</span>
            </button>
          </div>

          <!-- 分隔线 -->
          <div class="my-4 h-px bg-slate-800/80" />

          <!-- 登录态感知组 -->
          <div class="flex flex-col">
            <template v-if="isLoggedIn">
              <button
                class="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-200 transition hover:bg-slate-800/60 hover:text-white"
                @click="closeDrawer(); router.push('/app')"
              >
                <ZIcon name="ri:edit-box-line" :size="20" color="currentColor" class="text-slate-400" />
                <span>{{ t("home.nav.notes") }}</span>
              </button>
              <button
                class="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-rose-300 transition hover:bg-rose-500/10 hover:text-rose-200"
                @click="handleLogout"
              >
                <ZIcon name="ri:logout-box-r-line" :size="20" color="currentColor" />
                <span>{{ t("home.nav.logout") }}</span>
              </button>
            </template>
            <template v-else>
              <button
                class="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-200 transition hover:bg-slate-800/60 hover:text-white"
                @click="closeDrawer(); router.push('/user/login')"
              >
                <ZIcon name="ri:login-box-line" :size="20" color="currentColor" class="text-slate-400" />
                <span>{{ t("home.nav.login") }}</span>
              </button>
            </template>
          </div>
        </div>
      </NDrawerContent>
    </NDrawer>

    <!-- ==================== Hero ==================== -->
    <section class="relative overflow-hidden">
      <!-- 背景渐变光晕（缓慢呼吸） -->
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <div class="hero-blob hero-blob-1" />
        <div class="hero-blob hero-blob-2" />
        <div class="hero-blob hero-blob-3" />
        <!-- 网格遮罩 -->
        <div
          class="absolute inset-0 opacity-[0.04]"
          style="background-image: linear-gradient(rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.5) 1px, transparent 1px); background-size: 48px 48px;"
        />
      </div>

      <div class="relative mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:py-36">
        <!-- Hero 小标签（Tailwind pill） -->
        <span class="pill">
          <ZIcon name="ri:sparkling-2-line" :size="14" color="currentColor" />
          {{ t("home.hero.tagline") }}
        </span>

        <h1
          class="mt-6 bg-gradient-to-r from-white via-blue-100 to-cyan-200 bg-clip-text text-5xl font-bold leading-tight tracking-tight text-transparent sm:text-6xl lg:text-7xl"
        >
          {{ t("home.hero.title") }}
        </h1>

        <p class="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
          {{ t("home.hero.description") }}
        </p>

        <div class="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <button class="btn-base btn-primary btn-lg" @click="router.push(primaryCtaPath)">
            <span>{{ primaryCtaLabel }}</span>
            <ZIcon name="ri:arrow-right-line" :size="18" color="currentColor" />
          </button>
          <button class="btn-base btn-ghost btn-lg" @click="scrollToFeatures">
            {{ t("home.hero.cta_secondary") }}
          </button>
          <a
            v-if="locale === 'zh'"
            href="https://znote.xphub.dev/doc/guide"
            target="_blank"
            rel="noopener noreferrer"
            class="btn-base btn-ghost btn-lg"
          >
            {{ t("home.hero.help_doc") }}
          </a>
        </div>
      </div>
    </section>

    <!-- ==================== 特性区 ==================== -->
    <section id="features" class="relative scroll-mt-16 py-16 sm:py-24">
      <div class="mx-auto max-w-7xl px-4 sm:px-6">
        <div class="mb-12 text-center sm:mb-16">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
            {{ t("home.features.title") }}
          </h2>
          <p class="mt-3 text-slate-400 sm:mt-4">
            {{ t("home.features.subtitle") }}
          </p>
        </div>

        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          <div
            v-for="feature in features"
            :key="feature.icon + feature.titleKey"
            class="feature-card group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/50 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-blue-500/10"
          >
            <!-- hover 时浮现的渐变光 -->
            <div
              class="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/0 to-cyan-500/0 transition-all duration-500 group-hover:from-blue-500/10 group-hover:to-cyan-500/10"
              aria-hidden="true"
            />
            <div class="relative">
              <!-- 图标容器：水平居中 -->
              <div
                class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-400 ring-1 ring-blue-400/20"
              >
                <ZIcon :name="feature.icon" :size="24" color="currentColor" />
              </div>
              <h3 class="mt-5 text-lg font-semibold text-slate-100">
                {{ t(feature.titleKey) }}
              </h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-400">
                {{ t(feature.descKey) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 移动端 APP ==================== -->
    <section id="mobile-app" class="relative scroll-mt-16">
      <div class="mx-auto max-w-7xl px-4 sm:px-6">
        <!-- 标题 -->
        <div class="mb-12 text-center sm:mb-16">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
            {{ t("home.app.title") }}
          </h2>
          <p class="mt-3 text-slate-400 sm:mt-4">
            {{ t("home.app.subtitle") }}
          </p>
        </div>

        <!-- iOS / Android 双卡 -->
        <div class="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-2">
          <!-- iOS 卡片：开发中占位 -->
          <div class="app-card group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/50 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-blue-500/10 sm:p-8">
            <div
              class="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/0 to-cyan-500/0 transition-all duration-500 group-hover:from-blue-500/10 group-hover:to-cyan-500/10"
              aria-hidden="true"
            />
            <div class="relative flex flex-col items-center text-center">
              <div
                class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-500/20 to-slate-400/20 text-slate-300 ring-1 ring-slate-400/20"
              >
                <ZIcon name="ri:apple-fill" :size="28" color="currentColor" />
              </div>
              <h3 class="mt-5 text-xl font-semibold text-slate-100 sm:text-2xl">
                {{ t("home.app.ios.title") }}
              </h3>
              <!-- 开发中徽章 -->
              <span class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-700/40 px-3 py-1 text-xs font-medium text-slate-400 ring-1 ring-slate-500/20">
                <ZIcon name="ri:time-line" :size="12" color="currentColor" />
                {{ t("home.app.ios.badge") }}
              </span>
              <p class="mt-4 text-sm leading-relaxed text-slate-400">
                {{ t("home.app.ios.desc") }}
              </p>
              <!-- 禁用的 App Store 徽章（占位展示） -->
              <div
                class="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-2 opacity-50 grayscale"
                :title="t('home.app.ios.badge')"
              >
                <ZIcon name="ri:apple-fill" :size="20" color="currentColor" class="text-slate-300" />
                <span class="flex flex-col items-start leading-tight">
                  <span class="text-[10px] uppercase tracking-wide text-slate-500">Download on the</span>
                  <span class="text-sm font-semibold text-slate-400">App Store</span>
                </span>
              </div>
            </div>
          </div>

          <!-- Android 卡片：可下载 -->
          <div class="app-card group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/50 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-emerald-500/10 sm:p-8">
            <div
              class="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/0 to-cyan-500/0 transition-all duration-500 group-hover:from-emerald-500/10 group-hover:to-cyan-500/10"
              aria-hidden="true"
            />
            <div class="relative flex flex-col items-center text-center sm:flex-row sm:items-center sm:gap-8 sm:text-left">
              <!-- 左侧：标题 + 副标题 + 提示 + 按钮 -->
              <div class="flex flex-1 flex-col items-center sm:items-start">
                <div
                  class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-emerald-400 ring-1 ring-emerald-400/20 sm:mx-0"
                >
                  <ZIcon name="ri:android-fill" :size="28" color="currentColor" />
                </div>
                <h3 class="mt-5 text-xl font-semibold text-slate-100 sm:text-2xl">
                  {{ t("home.app.android.title") }}
                </h3>
                <!-- 可下载徽章（与 iOS 「开发中」徽章视觉对称） -->
                <span class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-400/20">
                  <ZIcon name="ri:check-line" :size="12" color="currentColor" />
                  {{ t("home.app.android.subtitle") }}
                </span>
                <p class="mt-4 text-sm leading-relaxed text-slate-400">
                  <template v-if="isMobile">
                    {{ t("home.app.android.click_hint") }}
                  </template>
                  <template v-else>
                    {{ t("home.app.android.scan_hint") }}
                  </template>
                </p>
                <!-- Android APK 徽章（移动端点击下载，桌面端为辅助 CTA；与 iOS App Store 徽章视觉对称） -->
                <a
                  :href="ANDROID_DOWNLOAD_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/60 px-4 py-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/50 hover:bg-slate-800/80 hover:shadow-lg hover:shadow-emerald-500/10 active:translate-y-0"
                  :title="t('home.app.android.button')"
                >
                  <ZIcon name="ri:android-fill" :size="22" color="currentColor" class="text-emerald-400" />
                  <span class="flex flex-col items-start leading-tight">
                    <span class="text-[10px] uppercase tracking-wide text-slate-500">Download</span>
                    <span class="text-sm font-semibold text-slate-200">APK</span>
                  </span>
                </a>
              </div>

              <!-- 右侧：二维码（仅桌面端展示） -->
              <div v-if="!isMobile" class="mt-6 flex shrink-0 flex-col items-center sm:mt-0">
                <div
                  class="rounded-2xl border border-slate-700/60 bg-white p-2 shadow-lg shadow-emerald-500/10"
                  :title="t('home.app.qr_alt')"
                >
                  <NQrCode
                    :value="ANDROID_DOWNLOAD_URL"
                    :size="140"
                    color="#0f172a"
                    background-color="#ffffff"
                    :padding="8"
                    type="svg"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 交流与反馈 ==================== -->
    <section id="contact" class="relative scroll-mt-16 border-t border-slate-800/40 bg-slate-900/20 py-10 sm:py-16">
      <div class="mx-auto max-w-7xl px-4 sm:px-6">
        <!-- 标题 -->
        <div class="mb-10 text-center sm:mb-14">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
            {{ t("home.contact.title") }}
          </h2>
          <p class="mt-3 text-slate-400 sm:mt-4">
            {{ t("home.contact.subtitle") }}
          </p>
        </div>

        <div class="flex flex-col items-center gap-10">
          <!-- QQ群二维码：单独一行居中 -->
          <div class="contact-qr group">
            <div
              class="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-4 backdrop-blur-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:border-blue-500/50 group-hover:bg-slate-900/80 group-hover:shadow-xl group-hover:shadow-blue-500/10"
            >
              <div
                class="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/0 to-cyan-500/0 transition-all duration-500 group-hover:from-blue-500/10 group-hover:to-cyan-500/10"
                aria-hidden="true"
              />
              <div class="relative">
                <img
                  src="https://img.rss.ink/2026/06/29/Bo0K0ULS.jpg"
                  :alt="t('home.contact.qq_group')"
                  class="block w-48 rounded-lg bg-white object-contain p-1 sm:w-56"
                  loading="lazy"
                />
                <p class="mt-3 text-center text-xs text-slate-500">
                  {{ t("home.contact.scan_hint") }}
                </p>
              </div>
            </div>
            <div class="mt-4 text-center">
              <p class="text-sm text-slate-400">{{ t("home.contact.qq_group") }}</p>
              <p class="mt-1 font-mono text-lg font-semibold tracking-wider text-slate-100">
                253828849
              </p>
            </div>
          </div>

          <!-- 链接区：博客 + X 一行 -->
          <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
            <a
              href="https://blog.xiaoz.org/"
              target="_blank"
              rel="noopener noreferrer"
              class="contact-link group"
            >
              <span
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-400 ring-1 ring-blue-400/20 transition-colors group-hover:from-blue-500/30 group-hover:to-cyan-500/30"
              >
                <ZIcon name="ri:article-line" :size="20" color="currentColor" />
              </span>
              <span class="flex-1 text-sm font-medium text-slate-200">
                {{ t("home.contact.blog") }}
              </span>
              <ZIcon
                name="ri:external-link-line"
                :size="16"
                color="currentColor"
                class="text-slate-500 transition-colors group-hover:text-blue-400"
              />
            </a>
            <a
              href="https://x.com/xiaozblog"
              target="_blank"
              rel="noopener noreferrer"
              class="contact-link group"
            >
              <span
                class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-400 ring-1 ring-blue-400/20 transition-colors group-hover:from-blue-500/30 group-hover:to-cyan-500/30"
              >
                <ZIcon name="ri:twitter-x-line" :size="20" color="currentColor" />
              </span>
              <span class="flex-1 text-sm font-medium text-slate-200">
                {{ t("home.contact.x") }}
              </span>
              <ZIcon
                name="ri:external-link-line"
                :size="16"
                color="currentColor"
                class="text-slate-500 transition-colors group-hover:text-blue-400"
              />
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== Footer ==================== -->
    <footer class="border-t border-slate-800/60 py-8 sm:py-10">
      <div class="mx-auto max-w-7xl px-4 text-center sm:px-6">
        <p class="text-sm text-slate-500">
          {{ t("home.footer.copyright") }}
          <a
            href="https://github.com/like-fly/znotetp"
            target="_blank"
            rel="noopener noreferrer"
            class="text-slate-400 underline-offset-4 transition hover:text-blue-400 hover:underline"
          >
            {{ t("home.footer.opensource") }}
          </a>
        </p>
        <p class="mt-2 text-xs text-slate-600">
          {{ t("home.footer.tagline") }}
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Tailwind v4：scoped 样式中使用 @apply 需要 @reference 引入工具类源 */
@reference "tailwindcss";

/* ==================== 自定义按钮（Tailwind 暗色主题） ==================== */

.btn-base {
  @apply inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium rounded-xl transition-all duration-200 select-none;
}

.btn-lg {
  @apply h-12 px-7 text-base;
}

.btn-md {
  @apply h-10 px-5 text-sm;
}

.btn-sm {
  @apply h-8 px-3 text-xs;
}

/* 主按钮：蓝青渐变 + hover 发光 + 轻微上浮（仅 Hero CTA 使用） */
.btn-primary {
  @apply text-white bg-gradient-to-r from-blue-500 to-cyan-400
         shadow-lg shadow-blue-500/30
         hover:shadow-xl hover:shadow-blue-500/50
         hover:from-blue-400 hover:to-cyan-300
         hover:-translate-y-0.5
         active:translate-y-0;
}

/* 次按钮：透明 + 描边 + hover 浅高亮（Hero 第二 CTA） */
.btn-ghost {
  @apply text-slate-200 border border-slate-700 bg-slate-900/40 backdrop-blur
         hover:bg-slate-800/60 hover:border-slate-600
         active:bg-slate-800/80;
}

/* 朴素文字按钮（Nav 登录）：无背景无边框，仅文字 + hover 颜色 */
.btn-text-plain {
  @apply px-2 py-1 text-sm font-medium text-slate-300 rounded
         transition-colors duration-200
         hover:text-white;
}

/* 朴素描边按钮（Nav 注册）：细描边 + hover 填底色 */
.btn-outline {
  @apply h-10 px-5 text-sm font-medium rounded-xl
         text-slate-200 border border-slate-600
         bg-transparent
         transition-colors duration-200
         hover:bg-slate-800/60 hover:border-slate-500 hover:text-white
         active:bg-slate-800/80;
}

/* ==================== Hero eyebrow pill ==================== */

.pill {
  @apply inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300 ring-1 ring-blue-400/20;
}

/* ==================== 交流与反馈 ==================== */

/* 链接胶囊：与 feature-card 同色系，hover 时浅描边+轻微抬升 */
.contact-link {
  @apply inline-flex items-center gap-3 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-900/40 px-5 py-3
         backdrop-blur transition-all duration-200
         hover:-translate-y-0.5 hover:border-blue-500/50 hover:bg-slate-800/60 hover:shadow-lg hover:shadow-blue-500/10
         active:translate-y-0;
}

/* ==================== Hero 背景光晕 ==================== */

.hero-blob {
  position: absolute;
  border-radius: 9999px;
  filter: blur(80px);
  will-change: transform, opacity;
}

.hero-blob-1 {
  top: -8rem;
  left: -6rem;
  width: 24rem;
  height: 24rem;
  background: rgba(59, 130, 246, 0.35);
  animation: hero-breathe 8s ease-in-out infinite;
}

.hero-blob-2 {
  top: 4rem;
  right: -8rem;
  width: 28rem;
  height: 28rem;
  background: rgba(34, 211, 238, 0.25);
  animation: hero-breathe 10s ease-in-out infinite;
  animation-delay: -3s;
}

.hero-blob-3 {
  bottom: -6rem;
  left: 30%;
  width: 22rem;
  height: 22rem;
  background: rgba(99, 102, 241, 0.2);
  animation: hero-breathe 12s ease-in-out infinite;
  animation-delay: -6s;
}

@keyframes hero-breathe {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  50% {
    transform: translate(20px, -20px) scale(1.05);
    opacity: 0.75;
  }
}

/* ==================== 可访问性：用户偏好减弱动效时禁用动画 ==================== */

@media (prefers-reduced-motion: reduce) {
  .hero-blob,
  .feature-card,
  .contact-link,
  .btn-base,
  .btn-text-plain,
  .btn-outline {
    animation: none !important;
    transition: none !important;
  }
}
</style>
