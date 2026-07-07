import { Context } from "hono";
import { count } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { resolveFrontendAssets } from "@/utils/frontend-assets";
import { getAppName } from "@/utils/helper";

export const APP_VERSION = "0.4.2";

export const getAppInfo = async (c: Context) => {
    const userCount = await db.select({ count: count() }).from(schema.users);
    const frontendAssets = resolveFrontendAssets();

    return c.json({
        code: 200,
        msg: "success",
        data: {
            app_name: getAppName(),
            version: APP_VERSION,
            date: frontendAssets?.buildId || "unknown",
            total_user_count: userCount[0]?.count || 0,
        },
    });
};
