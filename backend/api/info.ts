import { Context } from "hono";
import { count } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSiteTitle } from "@/api/setting";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { resolveFrontendAssets } from "@/utils/frontend-assets";

let cachedPackageVersion: string | null = null;

/**
 * 统一解析应用版本号：
 * 1. 优先使用运行时注入的 APP_VERSION（发布镜像）
 * 2. 回退根 package.json 的 version（本地/非 tag 场景）
 */
const resolveAppVersion = () => {
    const envVersion = Bun.env.APP_VERSION?.trim();
    if (envVersion) {
        return envVersion;
    }

    if (cachedPackageVersion !== null) {
        return cachedPackageVersion;
    }

    try {
        const packageJsonPath = join(process.cwd(), "package.json");
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version?: string };
        cachedPackageVersion = packageJson.version?.trim() || "unknown";
    } catch {
        cachedPackageVersion = "unknown";
    }

    return cachedPackageVersion;
};

export const getAppInfo = async (c: Context) => {
    const userCount = await db.select({ count: count() }).from(schema.users);
    const frontendAssets = resolveFrontendAssets();
    const appName = await getSiteTitle();

    return c.json({
        code: 200,
        msg: "success",
        data: {
            app_name: appName,
            version: resolveAppVersion(),
            date: frontendAssets?.buildId || "unknown",
            total_user_count: userCount[0]?.count || 0,
        },
    });
};
