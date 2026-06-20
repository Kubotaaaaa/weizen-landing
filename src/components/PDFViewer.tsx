import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// worker จาก public/ (same-origin, static-build robust)
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// render PDF (same-origin) เป็น canvas ในหน้าเว็บเรา ด้วย PDF.js — ไม่ใช้ iframe
export default function PDFViewer({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument(src).promise;
        if (cancelled) return;
        setPages(pdf.numPages);
        const container = ref.current;
        if (!container) return;
        container.replaceChildren();
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.4 });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = viewport.width * dpr;
          canvas.height = viewport.height * dpr;
          canvas.style.width = "100%";
          canvas.style.maxWidth = `${viewport.width}px`;
          canvas.style.margin = "0 auto";
          canvas.style.display = "block";
          canvas.style.borderRadius = "6px";
          canvas.style.boxShadow = "0 1px 6px rgba(0,0,0,.15)";
          ctx.scale(dpr, dpr);
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
        setStatus("done");
      } catch {
        setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  return (
    <div>
      <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>
        {status === "loading" && "กำลัง render PDF ในหน้านี้ (PDF.js)…"}
        {status === "done" && `${pages} หน้า · render ในเว็บด้วย PDF.js (ไม่ใช่ iframe)`}
        {status === "error" && "โหลด PDF ไม่ได้"}
      </p>
      <div ref={ref} className="flex flex-col gap-3 max-h-[80vh] overflow-y-auto rounded-lg p-3" style={{ background: "var(--color-surface)" }} />
    </div>
  );
}
