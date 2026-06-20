import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Blog = markdown database (type-safe via Zod). โพสต์ตามเวลา + หมายเลข workshop
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    workshop: z.string().optional(), // เช่น "ws06" — ไว้ reference
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  }),
});

// Books = หนังสือเต็มเล่ม (markdown → HTML อ่านในเว็บ, indexable). PDF = ดาวน์โหลดรอง
const books = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/books" }),
  schema: z.object({
    title: z.string(),
    sub: z.string(),
    date: z.coerce.date(),
    pages: z.number().optional(),
    order: z.number().default(99),
    workshop: z.string().optional(),
    cover: z.string(),
    pdf: z.string().optional(),
    repo: z.string(),
    repoLabel: z.string(),
  }),
});

export const collections = { blog, books };
