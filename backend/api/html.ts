import { Context } from "hono";
import { html, raw } from "hono/html";
import { checkSystemInitialized } from "@/api/system";
import { getSettingValue } from "@/api/setting";
import { resolveFrontendAssets } from "@/utils/frontend-assets";
import { getAppName } from "@/utils/helper";

export const index = async (c: Context) => {
    if (c.req.path === "/") {
        const initialized = await checkSystemInitialized();
        if (!initialized) {
            return c.redirect("/user/init", 302);
        }
    }

    const site_setting = (await getSettingValue("site_setting")) || {};

    if (c.req.path.startsWith("/dashboard")) {
        site_setting.custom_header = "";
    }

    const title = site_setting.title || getAppName();
    const frontendAssets = resolveFrontendAssets();

    if (!frontendAssets) {
        c.status(503);
        return c.html(html`<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="font-family: sans-serif; padding: 24px;">
    <h1>Frontend assets not built</h1>
    <p>Please run <code>bun run build</code> before starting the production server.</p>
  </body>
</html>`);
    }

    return c.html(html`<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>${title}</title>
    <meta name="keywords" content="${site_setting.keywords || ""}" />
    <meta name="description" content="${site_setting.description || ""}" />
    <link rel="icon" href="/static/images/znote.svg" />
    <script type="module" crossorigin src="/static/assets/${frontendAssets.jsEntry}"></script>
    <link rel="stylesheet" href="/static/assets/${frontendAssets.cssEntry}" />
    ${raw(site_setting.custom_header) || ""}
    <style>
      body { margin: 0; background: #f5f7fb; }
      #app-loading {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #64748b;
        font: bold 16px sans-serif;
      }
      #app:not(:empty) + #app-loading,
      #app:not(:empty) ~ #app-loading {
        opacity: 0;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="app-loading">Loading...</div>
  </body>
</html>`);
};
