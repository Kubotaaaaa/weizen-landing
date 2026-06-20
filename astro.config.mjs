import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";

// build provenance — commit/branch/เวลา build ไว้โชว์ใน footer (debug deploy)
// execFileSync + arg array = ไม่ผ่าน shell (กัน injection); อินพุตเป็นค่าคงที่อยู่แล้ว
const git = (args, fallback) => { try { return execFileSync("git", args).toString().trim(); } catch { return fallback; } };
const COMMIT = git(["rev-parse", "--short", "HEAD"], "dev");
const BRANCH = git(["rev-parse", "--abbrev-ref", "HEAD"], "?");
const BUILD_TIME = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" }) + " (GMT+7)";

// Weizen Oracle landing — static, Cloudflare, zero-JS by default (React only on islands)
export default defineConfig({
  site: "https://weizen.buildwithoracle.com",
  output: "static",
  adapter: cloudflare(),
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    define: {
      "import.meta.env.PUBLIC_COMMIT": JSON.stringify(COMMIT),
      "import.meta.env.PUBLIC_BRANCH": JSON.stringify(BRANCH),
      "import.meta.env.PUBLIC_BUILD_TIME": JSON.stringify(BUILD_TIME),
    },
    server: { watch: { ignored: ["**/ψ/**"] } },
  },
});
