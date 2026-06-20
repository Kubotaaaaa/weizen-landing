import { useState } from "react";

// React island (client:load) — Web3 connect wallet (EIP-1193 window.ethereum)
// แสดง address ของผู้ที่เชื่อมต่อ · ผูกกับธีม ArraMQ/L2 ที่เรียนมา (chain 20260619)
export default function WalletConnect() {
  const [addr, setAddr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function connect() {
    setErr(null);
    const eth = (globalThis as any).ethereum;
    if (!eth) { setErr("ไม่พบ wallet (ติดตั้ง MetaMask/Rabby ก่อนนะครับ)"); return; }
    try {
      const accs: string[] = await eth.request({ method: "eth_requestAccounts" });
      setAddr(accs?.[0] ?? null);
    } catch {
      setErr("ผู้ใช้ปฏิเสธการเชื่อมต่อ");
    }
  }

  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : null;

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={connect}
        className="rounded-full px-5 py-2.5 font-semibold transition active:scale-95"
        style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
      >
        {short ? `✅ ${short}` : "🔗 Connect Wallet"}
      </button>
      {addr && <span className="text-xs" style={{ color: "var(--color-muted)" }}>เชื่อมแล้ว — identity = address ของคุณ (แนวคิด ArraMQ / SIWE)</span>}
      {err && <span className="text-xs" style={{ color: "#c0392b" }}>{err}</span>}
    </div>
  );
}
