import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import AutoImport from "unplugin-auto-import/vite";
import { NaiveUiResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";

const devApiTarget = process.env.DEV_API_PROXY_TARGET || "http://localhost:3888";

export default defineConfig({
    plugins: [
        vue(),
        tailwindcss(),
        AutoImport({
            imports: [
                "vue",
                {
                    "naive-ui": [
                        "useDialog",
                        "useMessage",
                        "useNotification",
                        "useLoadingBar",
                    ],
                },
            ],
        }),
        Components({
            resolvers: [NaiveUiResolver()],
        }),
        // 预编译 locales 目录下的翻译文件，将 {key} 占位符编译为 AST 函数
        // 避免生产构建因 tree-shaking 移除运行时 message compiler 导致变量无法替换
        VueI18nPlugin({
            include: [fileURLToPath(new URL("./src/i18n/locales/**", import.meta.url))],
        }),
    ],
    server: {
        host: "0.0.0.0",
        port: 4000,
        proxy: {
            // 本地开发时将前端同源请求转发到 Bun 后端，避免把开发地址写入构建产物
            "/api": {
                target: devApiTarget,
                changeOrigin: true,
            },
            "/files": {
                target: devApiTarget,
                changeOrigin: true,
            },
            "/_resources": {
                target: devApiTarget,
                changeOrigin: true,
            },
            "/assets": {
                target: devApiTarget,
                changeOrigin: true,
            },
            "/reset_admin_password": {
                target: devApiTarget,
                changeOrigin: true,
            },
        },
    },
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    build: {
        cssCodeSplit: false,
        rollupOptions: {
            output: {
                // 入口文件使用内容哈希，避免同一天重复发版时命中旧缓存。
                entryFileNames: "static/assets/app-[hash].js",
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith(".css")) {
                        return "static/assets/app-[hash].css";
                    }
                    return "static/assets/[name]-[hash].[ext]";
                },
                chunkFileNames: "static/assets/[name]-[hash].js",
            },
        },
    },
});
