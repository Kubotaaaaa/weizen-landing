import { useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData, keccak256, toHex } from "viem";

// ArraMQ playground — sign + verify EIP-712 message ใน browser (เล่นได้เลย ไม่ต้องมี wallet)
// ใช้ demo key (anvil #0, public) เพื่อสาธิต flow E2E ของ ArraMQ
const domain = { name: "ARRA-MQTT", version: "1", chainId: 20260619 } as const;
const types = {
  Msg: [
    { name: "from", type: "address" },
    { name: "topic", type: "string" },
    { name: "ts", type: "uint64" },
    { name: "seq", type: "uint64" },
    { name: "dataHash", type: "bytes32" },
  ],
} as const;
const demo = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

export default function ArraMQPlayground() {
  const [topic, setTopic] = useState("sensors/temp");
  const [data, setData] = useState('{"c":27.4}');
  const [out, setOut] = useState<{ ok: boolean; from: string; sig: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const message = {
        from: demo.address,
        topic,
        ts: BigInt(Math.floor(Date.now() / 1000)),
        seq: 1n,
        dataHash: keccak256(toHex(data)),
      };
      const sig = await demo.signTypedData({ domain, types, primaryType: "Msg", message });
      const ok = await verifyTypedData({ address: demo.address, domain, types, primaryType: "Msg", message, signature: sig });
      setOut({ ok, from: demo.address, sig });
    } finally {
      setBusy(false);
    }
  }

  const field = { background: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" };

  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-muted)" }}>topic</span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} className="rounded-md border px-3 py-2 font-mono text-sm" style={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "var(--color-muted)" }}>data (JSON)</span>
          <input value={data} onChange={(e) => setData(e.target.value)} className="rounded-md border px-3 py-2 font-mono text-sm" style={field} />
        </label>
      </div>
      <button onClick={run} disabled={busy} className="mt-4 rounded-full px-5 py-2.5 font-semibold transition active:scale-95 disabled:opacity-60" style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}>
        {busy ? "…" : "🔏 Sign + Verify (EIP-712)"}
      </button>
      {out && (
        <div className="mt-4 font-mono text-xs space-y-1 break-all">
          <p style={{ color: "var(--color-muted)" }}>signer: {out.from}</p>
          <p style={{ color: "var(--color-muted)" }}>sig: {out.sig.slice(0, 42)}…</p>
          <p style={{ color: out.ok ? "#15803d" : "#c0392b", fontWeight: 700 }}>
            {out.ok ? "✅ verified — ลายเซ็น recover ได้ == signer (E2E ผ่าน)" : "❌ verify failed"}
          </p>
        </div>
      )}
      <p className="mt-3 text-xs" style={{ color: "var(--color-muted)" }}>
        แก้ data แล้วลายเซ็นเดิม verify ไม่ผ่าน = integrity · domain ARRA-MQTT/chain 20260619 = กัน replay ข้าม app
      </p>
    </div>
  );
}
