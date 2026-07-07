import { Context } from "hono";
import { count } from "drizzle-orm";
import { getSiteTitle } from "@/api/setting";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { resolveFrontendAssets } from "@/utils/frontend-assets";

export const APP_VERSION = "0.4.2";

export const getAppInfo = async (c: Context) => {
    const userCount = await db.select({ count: count() }).from(schema.users);
    const frontendAssets = resolveFrontendAssets();
    const appName = await getSiteTitle();

    return c.json({
        code: 200,
        msg: "success",
        data: {
            app_name: appName,
            version: APP_VERSION,
            date: frontendAssets?.buildId || "unknown",
            total_user_count: userCount[0]?.count || 0,
        },
    });
};
