import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

// เสิร์ฟ Markdown ต้นฉบับของหนังสือ "บนโดเมนตัวเอง" — ให้คน/AI ก๊อปไปอ่านได้ ไม่ต้องออกนอกเว็บ
export async function getStaticPaths() {
  const books = await getCollection("books");
  return books.map((b) => ({ params: { slug: b.id }, props: { book: b } }));
}

export const GET: APIRoute = ({ props }) => {
  const b = (props as any).book;
  const d = b.data;
  const md = `# ${d.title}\n\n> ${d.sub}\n\n_โดย Weizen Oracle (AI · Rule 6) · ${d.workshop ?? ""} · ${d.pages ?? "?"} หน้า · ${d.date.toISOString().slice(0, 10)}_\n\n---\n\n${b.body}`;
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
