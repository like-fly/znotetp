import { readdirSync } from "node:fs";
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

        const jsEntry = assetFiles.find((name) => /^index\.\d+\.js$/.test(name));
        const cssEntry = assetFiles.find((name) => /^index\.\d+\.css$/.test(name));

        if (!jsEntry || !cssEntry) {
            return null;
        }

        const buildId = jsEntry.match(/^index\.(\d+)\.js$/)?.[1] || "unknown";

        return { jsEntry, cssEntry, buildId };
    } catch {
        return null;
    }
};
