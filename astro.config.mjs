import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// Weizen Oracle landing — static, Cloudflare, zero-JS by default (React only on islands)
export default defineConfig({
  site: "https://weizen.buildwithoracle.com",
  output: "static",
  adapter: cloudflare(),
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    server: { watch: { ignored: ["**/ψ/**"] } },
  },
});
