import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type FrontendAssets = {
    jsEntry: string;
    cssEntry: string;
    buildId: string;
};

/**
 * 从构建产物目录解析前端入口资源，避免后端依赖手写的构建版本号。
 */
export const resolveFrontendAssets = (): FrontendAssets | null => {
    try {
        const assetsDir = join(process.cwd(), "public", "static", "assets");
        const assetFiles = readdirSync(assetsDir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name);

        // Vite 入口 JS 和 CSS 的 hash 彼此独立，不能假设同一批产物会共用同一个后缀。
        const latestJsEntry = assetFiles
            .filter((fileName) => /^app-[A-Za-z0-9_-]+\.js$/.test(fileName))
            .sort((a, b) => statSync(join(assetsDir, b)).mtimeMs - statSync(join(assetsDir, a)).mtimeMs)[0];

        const latestCssEntry = assetFiles
            .filter((fileName) => /^app-[A-Za-z0-9_-]+\.css$/.test(fileName))
            .sort((a, b) => statSync(join(assetsDir, b)).mtimeMs - statSync(join(assetsDir, a)).mtimeMs)[0];

        if (!latestJsEntry || !latestCssEntry) {
            return null;
        }

        return {
            jsEntry: latestJsEntry,
            cssEntry: latestCssEntry,
            buildId: latestJsEntry.match(/^app-([A-Za-z0-9_-]+)\.js$/)?.[1] || "unknown",
        };
    } catch {
        return null;
    }
};
