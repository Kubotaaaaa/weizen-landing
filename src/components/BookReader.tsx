import { useState } from "react";

type Props = {
  title: string;
  sub: string;
  cover: string;
  pdf: string;
  source?: string;
  sourceLabel?: string;
};

// อ่าน PDF ในเว็บ — render PDF (same-origin ของเราเอง) ในหน้านี้เลย เปิดเมื่อกด (lazy)
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
            <a href={pdf} target="_blank" rel="noopener" className="text-sm rounded-full px-3 py-1.5 border transition" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}>เปิดเต็มจอ ↗</a>
            {source && <a href={source} target="_blank" rel="noopener" className="text-sm rounded-full px-3 py-1.5 border transition" style={{ borderColor: "var(--color-border)", color: "var(--color-accent)" }}>{sourceLabel ?? "source"} ↗</a>}
          </div>
        </div>
      </div>
      {open && (
        <div className="p-3 border-t" style={{ borderColor: "var(--color-border)" }}>
          <object data={`${pdf}#view=FitH`} type="application/pdf" className="w-full rounded-lg" style={{ height: "82vh", background: "var(--color-bg)" }}>
            <p className="text-sm p-4" style={{ color: "var(--color-muted)" }}>
              เบราว์เซอร์เปิด PDF ในหน้าไม่ได้ — <a href={pdf} className="underline" style={{ color: "var(--color-accent)" }}>กดเปิด/ดาวน์โหลด PDF</a>
            </p>
          </object>
          <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>อ่านในเว็บ (PDF ของเราเอง · same-origin · ไม่ดึงข้อมูลจากภายนอก)</p>
        </div>
      )}
    </div>
  );
}
