import { createRouter, createWebHistory } from "vue-router";
import req from "@/utils/req";

/** 系统初始化状态缓存，避免每次路由跳转都请求接口 */
const initStatusCache: { checked: boolean; initialized: boolean } = {
    checked: false,
    initialized: false,
};

const checkInitStatus = async (): Promise<boolean> => {
    if (initStatusCache.checked) return initStatusCache.initialized;
    try {
        const res = await req.get("/api/system/status");
        if (res.data?.code === 200) {
            initStatusCache.initialized = res.data.data?.initialized ?? false;
        }
    } catch {
        // 请求失败时默认未初始化，不缓存结果以便重试
        return false;
    }
    initStatusCache.checked = true;
    return initStatusCache.initialized;
};

/** 校验本地 token 是否仍然有效 */
const verifyToken = async (): Promise<boolean> => {
    try {
        const res = await req.get("/api/user/check_login");
        return res.data?.code === 200;
    } catch {
        return false;
    }
};

/** 重置初始化缓存（初始化完成后调用） */
export const resetInitStatus = (): void => {
    initStatusCache.checked = false;
    initStatusCache.initialized = false;
};

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: "/",
            name: "home",
            component: () => import("@/views/HomeView.vue"),
        },
        {
            path: "/app",
            name: "note",
            component: () => import("@/views/NoteView.vue"),
        },
        {
            path: "/app/note/:noteId",
            name: "noteDetail",
            component: () => import("@/views/NoteView.vue"),
        },
        {
            path: "/app/ai",
            name: "ai",
            component: () => import("@/views/AIView.vue"),
        },
        {
            path: "/dashboard",
            redirect: "/dashboard/home",
        },
        {
            path: "/dashboard/:name",
            name: "dashboard",
            component: () => import("@/views/DashboardView.vue"),
        },
        {
            path: "/user/init",
            name: "init",
            component: () => import("@/views/InitView.vue"),
        },
        {
            path: "/user/login",
            name: "login",
            component: () => import("@/views/LoginView.vue"),
        },
        {
            path: "/user/register",
            name: "register",
            component: () => import("@/views/RegisterView.vue"),
        },
        {
            path: "/s/:shareId",
            name: "share",
            component: () => import("@/views/ShareView.vue"),
        },
        {
            path: "/docs",
            name: "docs",
            component: () => import("@/views/DocsListView.vue"),
        },
        {
            path: "/doc/_ai",
            name: "docAI",
            component: () => import("@/views/DocAIView.vue"),
        },
        {
            path: "/doc/:slug",
            name: "doc",
            component: () => import("@/views/DocView.vue"),
            children: [
                {
                    path: "",
                    name: "docHome",
                    component: () => import("@/components/doc/DocHome.vue"),
                },
                {
                    path: "notebook-:notebookId(\\d+)",
                    name: "docCategory",
                    component: () => import("@/components/doc/DocCategory.vue"),
                },
                {
                    path: "note-:noteId(\\d+)",
                    name: "docNote",
                    component: () => import("@/components/doc/DocNote.vue"),
                },
            ],
        },
        {
            path: "/:pathMatch(.*)*",
            name: "notFound",
            component: () => import("@/views/NotFoundView.vue"),
        },
    ],
});

router.beforeEach(async (to) => {
    // 1. 检查系统是否已初始化
    const initialized = await checkInitStatus();

    // 未初始化时只允许访问 /user/init
    if (!initialized) {
        if (to.path === "/user/init") return true;
        // 也放行 API 相关的公开页面（分享、文档）
        if (to.path.startsWith("/s/") || to.path.startsWith("/docs") || to.path.startsWith("/doc/")) return true;
        return "/user/init";
    }

    // 已初始化：不允许再访问初始化页面
    if (to.path === "/user/init") {
        return "/user/login";
    }

    // 已初始化：处理首页/根路径的默认跳转
    if (to.path === "/") {
        const hasToken = !!localStorage.getItem("token");
        if (hasToken) {
            const valid = await verifyToken();
            if (valid) return "/app";
        }
        return "/user/login";
    }

    // 公开路径：无需登录即可访问
    const publicPaths = ["/user/login", "/user/register"];
    if (publicPaths.includes(to.path) || to.path.startsWith("/docs") || to.path.startsWith("/doc/") || to.path.startsWith("/s/")) {
        return true;
    }

    // 需要登录的路径：检查 token
    const token = localStorage.getItem("token");
    if (!token) {
        return "/user/login";
    }

    return true;
});

export default router;
