// ─────────────────────────────────────────────
// Environment Loader
// ─────────────────────────────────────────────
// Imported FIRST (before any other module) in index.js so environment
// variables are populated before services like Supabase initialise.
//
// The server's secrets live in the project-root .env. We resolve that path
// absolutely from this file's location so it loads correctly no matter what
// directory the server process was started from.
// ─────────────────────────────────────────────

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// server/src/loadEnv.js  →  ../../.env  →  project-root/.env
dotenv.config({ path: join(__dirname, "../../.env") });
