import type { Config } from "drizzle-kit";
import { DB_FILE } from "./backend/path";

const dbPath = DB_FILE;

export default {
    schema: "./backend/db/schema.ts",
    out: "./drizzle",
    dialect: "turso",
    // 只管理 schema.ts 中定义的业务表
    // 忽略 FTS5 虚拟表 notes_fts 及其 shadow tables（由 backend/db/fts.ts 原生 SQL 维护）
    // 新增 schema.ts 表时需同步把表名加到此处
    tablesFilter: [
        "users",
        "sessions",
        "user_settings",
        "notebooks",
        "notes",
        "note_versions",
        "tags",
        "note_tags",
        "files",
    ],
    dbCredentials: {
        url: `file:${dbPath}`,
    },
} satisfies Config;
