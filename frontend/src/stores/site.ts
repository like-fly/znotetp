import { defineStore } from "pinia";
import req from "@/utils/req";

export const useSiteStore = defineStore("site", {
    state: () => ({
        siteTitle: "ZNoteTP",
        siteSubtitle: "",
        appInfo: {
            app_name: "ZNoteTP",
            version: "0.1.0",
            date: "-",
            total_user_count: 0,
        },
    }),
    actions: {
        setSiteSetting(setting: { title?: string; sub_title?: string }) {
            const nextTitle = setting.title?.trim() || "ZNoteTP";
            const nextSubtitle = setting.sub_title?.trim() || "";
            this.siteTitle = nextTitle;
            this.siteSubtitle = nextSubtitle;
            this.appInfo.app_name = nextTitle;
        },
        async fetchSiteSetting() {
            const res = await req.get("/api/public_setting", {
                params: { key: "site_setting" },
            });
            if (res.data?.code === 200 && res.data?.data) {
                this.setSiteSetting(res.data.data);
            }
            return {
                title: this.siteTitle,
                sub_title: this.siteSubtitle,
            };
        },
        async fetchAppInfo() {
            const res = await req.get("/api/admin/app_info");
            if (res.data?.code === 200 && res.data?.data) {
                Object.assign(this.appInfo, res.data.data);
                this.setSiteSetting({ title: res.data.data.app_name || "" });
            }
            return this.appInfo;
        },
    },
});
