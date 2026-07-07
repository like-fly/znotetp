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

        const buildEntries = assetFiles.reduce<Map<string, Partial<FrontendAssets>>>((map, fileName) => {
            const jsMatch = fileName.match(/^app-([A-Za-z0-9_-]+)\.js$/);
            if (jsMatch) {
                const buildId = jsMatch[1];
                const current = map.get(buildId) || { buildId };
                current.jsEntry = fileName;
                map.set(buildId, current);
                return map;
            }

            const cssMatch = fileName.match(/^app-([A-Za-z0-9_-]+)\.css$/);
            if (cssMatch) {
                const buildId = cssMatch[1];
                const current = map.get(buildId) || { buildId };
                current.cssEntry = fileName;
                map.set(buildId, current);
            }

            return map;
        }, new Map());

        const pairedEntries = Array.from(buildEntries.values())
            .filter((entry): entry is FrontendAssets => Boolean(entry.jsEntry && entry.cssEntry && entry.buildId))
            .sort((a, b) => {
                const aMtime = statSync(join(assetsDir, a.jsEntry)).mtimeMs;
                const bMtime = statSync(join(assetsDir, b.jsEntry)).mtimeMs;
                return bMtime - aMtime;
            });

        const latestEntry = pairedEntries[0];

        if (!latestEntry) {
            return null;
        }

        return latestEntry;
    } catch {
        return null;
    }
};
