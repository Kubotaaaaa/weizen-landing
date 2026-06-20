import { useState } from "react";
import { recoverMessageAddress } from "viem";

// Client-side SIWE (EIP-4361) sign-in demo — connect → สร้าง SIWE message → personal_sign
// → recover address ฝั่ง browser แล้วเทียบ. ไม่มี server/secret (เดโม) — backend per-address รอ spec อ.นัท
export default function SiweConnect() {
  const [addr, setAddr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const eth = () => (globalThis as any).ethereum;

  async function connect() {
    setErr(null);
    if (!eth()) { setErr("ไม่พบ wallet — ติดตั้ง MetaMask/Rabby ก่อนนะครับ"); return; }
    try {
      const accs: string[] = await eth().request({ method: "eth_requestAccounts" });
      setAddr(accs?.[0] ?? null); setMessage(null); setSig(null); setVerified(null);
    } catch { setErr("ผู้ใช้ปฏิเสธการเชื่อมต่อ"); }
  }

  function buildSiwe(address: string) {
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    return [
      `${location.host} wants you to sign in with your Ethereum account:`,
      address,
      "",
      "ลงชื่อเข้าใช้ Weizen Oracle (เดโม SIWE — เซ็นฝั่งคุณ ไม่ส่งข้อมูลออก)",
      "",
      `URI: ${location.origin}`,
      "Version: 1",
      "Chain ID: 20260619",
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");
  }

  async function signIn() {
    if (!addr) return;
    setErr(null); setVerified(null); setBusy(true);
    try {
      const msg = buildSiwe(addr);
      setMessage(msg);
      const signature: string = await eth().request({ method: "personal_sign", params: [msg, addr] });
      setSig(signature);
      const recovered = await recoverMessageAddress({ message: msg, signature: signature as `0x${string}` });
      setVerified(recovered.toLowerCase() === addr.toLowerCase());
    } catch (e: any) {
      setErr(e?.message?.slice(0, 140) ?? "เซ็นไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : null;
  const box: React.CSSProperties = {
    background: "var(--color-surface)", border: "1px solid var(--color-border)",
    borderRadius: 12, padding: "0.8rem 1rem", fontFamily: "var(--font-mono)",
    fontSize: ".8rem", whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--color-text)",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={connect} className="rounded-full px-5 py-2.5 font-semibold transition active:scale-95"
          style={{ background: addr ? "var(--color-surface)" : "var(--color-accent)", color: addr ? "var(--color-text)" : "var(--color-bg)", border: "1px solid var(--color-border)" }}>
          {short ? `✅ ${short}` : "🔗 Connect Wallet"}
        </button>
        {addr && (
          <button onClick={signIn} disabled={busy} className="rounded-full px-5 py-2.5 font-semibold transition active:scale-95"
            style={{ background: "var(--color-accent)", color: "var(--color-bg)", opacity: busy ? 0.6 : 1 }}>
            {busy ? "กำลังเซ็น…" : "✍️ Sign in with Ethereum"}
          </button>
        )}
      </div>

      {err && <span className="text-sm" style={{ color: "#c0392b" }}>{err}</span>}

      {message && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>SIWE message (EIP-4361)</span>
          <div style={box}>{message}</div>
        </div>
      )}
      {sig && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>signature</span>
          <div style={box}>{sig}</div>
        </div>
      )}
      {verified !== null && (
        <div className="rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ background: verified ? "color-mix(in oklab, var(--color-accent) 16%, transparent)" : "rgba(192,57,43,.12)",
                   border: `1px solid ${verified ? "var(--color-accent)" : "#c0392b"}`,
                   color: verified ? "var(--color-accent-strong)" : "#c0392b" }}>
          {verified
            ? `✅ recover ได้ address ตรงกับที่เชื่อม — ลายเซ็นยืนยันตัวตนได้จริง (นี่คือหัวใจ SIWE: พิสูจน์ว่าคุณคุม private key ของ ${short} โดยไม่เปิดเผยมัน)`
            : "❌ address ที่ recover ได้ไม่ตรง — ลายเซ็นใช้ไม่ได้"}
        </div>
      )}
    </div>
  );
}
