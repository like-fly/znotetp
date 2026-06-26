import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { dirname } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { DB_FILE } from "../path";
import * as schema from "./schema";

const dbFile = DB_FILE;
const dbDir = dirname(dbFile);

if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
}

const client = createClient({
    url: `file:${dbFile}`,
});

await client.execute("PRAGMA journal_mode = WAL");

export const db = drizzle({ client, schema });
