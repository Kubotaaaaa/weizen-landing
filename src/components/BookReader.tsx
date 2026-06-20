import { useState } from "react";
import PDFViewer from "./PDFViewer";

type Props = {
  title: string;
  sub: string;
  cover: string;
  pdf: string;
  source?: string;
  sourceLabel?: string;
};

// อ่าน PDF ในเว็บ (PDF.js) — เปิดเมื่อกด (lazy, ไม่โหลดทุกเล่มพร้อมกัน)
export default function BookReader({ title, sub, cover, pdf, source, sourceLabel }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="flex gap-4 p-4">
        <img src={cover} alt={`ปก ${title}`} loading="lazy" className="w-24 h-32 object-cover rounded-md border shrink-0" style={{ borderColor: "var(--color-border)" }} />
        <div className="min-w-0">
          <h3 className="font-bold text-lg leading-snug">{title}</h3>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>{sub}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              onClick={() => setOpen((o) => !o)}
              className="rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95"
              style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
            >
              {open ? "✕ ปิด" : "📖 เปิดอ่านในเว็บ"}
            </button>
            <a href={`${pdf}`} target="_blank" rel="noopener" className="text-sm rounded-full px-3 py-1.5 border" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}>เปิดเต็มจอ ↗</a>
            {source && <a href={source} target="_blank" rel="noopener" className="text-sm rounded-full px-3 py-1.5 border" style={{ borderColor: "var(--color-border)", color: "var(--color-accent)" }}>{sourceLabel ?? "source"} ↗</a>}
          </div>
        </div>
      </div>
      {open && (
        <div className="p-4 border-t" style={{ borderColor: "var(--color-border)" }}>
          <PDFViewer src={pdf} />
        </div>
      )}
    </div>
  );
}
