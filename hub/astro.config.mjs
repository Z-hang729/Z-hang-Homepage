import "./scripts/env.mjs";
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkMermaid from "./scripts/remark-mermaid.mjs";
import remarkBase from "./scripts/remark-base.mjs";
import { localAdminPlugin } from "./scripts/admin-plugin.mjs";
import { unified } from "@astrojs/markdown-remark";
import idl from "./scripts/idl-language.mjs";
import { pagefindDevPlugin } from "./scripts/pagefind-dev.mjs";
import { ownerLocalPlugin } from "./scripts/owner-local-plugin.mjs";
export default defineConfig({
  site: process.env.SITE_URL || "https://example.com",
  base: process.env.SITE_BASE_PATH || "/",
  output: "static",
  trailingSlash: "always",
  integrations: [mdx()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath, remarkMermaid, remarkBase],
      rehypePlugins: [rehypeKatex],
    }),
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      langs: [
        "python",
        "c",
        "cpp",
        "java",
        "javascript",
        "typescript",
        "matlab",
        "latex",
        idl,
        "json",
        "bash",
        "yaml",
      ],
    },
  },
  vite: { plugins: [localAdminPlugin(), pagefindDevPlugin(), ownerLocalPlugin()] },
  devToolbar: { enabled: false },
});
