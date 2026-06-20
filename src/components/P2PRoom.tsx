import { useEffect, useRef, useState } from "react";

// Weizen P2P room — WebRTC mesh: แชต (text) + โยนไฟล์ (binary chunks) ผ่าน RTCDataChannel
// signalling server แค่แลก SDP/ICE ตอนเริ่ม (ไม่เห็นเนื้อหา). DataChannel = P2P ตรงกัน E2E
const DEFAULT_SIGNAL = (import.meta as any).env?.PUBLIC_SIGNALLING_URL || "";
const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }];
const CHUNK = 16 * 1024;

type Msg = { who: string; kind: "chat" | "file" | "sys"; text?: string; fileName?: string; url?: string; size?: number };

export default function P2PRoom() {
  const [signal, setSignal] = useState(DEFAULT_SIGNAL);
  const [room, setRoom] = useState("weizen-lobby");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("ยังไม่เชื่อม");
  const [peers, setPeers] = useState<string[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");

  const ws = useRef<WebSocket | null>(null);
  const self = useRef<string>("");
  const conns = useRef<Map<string, { pc: RTCPeerConnection; dc?: RTCDataChannel }>>(new Map());
  const incoming = useRef<Map<string, { name: string; mime: string; size: number; buf: ArrayBuffer[] }>>(new Map());

  function log(m: Msg) { setMsgs((x) => [...x, m]); }
  const myName = () => name.trim() || `peer-${self.current.slice(0, 4)}`;

  function send(obj: any) { ws.current?.send(JSON.stringify(obj)); }

  function wireChannel(peer: string, dc: RTCDataChannel) {
    dc.binaryType = "arraybuffer";
    const entry = conns.current.get(peer); if (entry) entry.dc = dc;
    dc.onopen = () => { setPeers((p) => Array.from(new Set([...p, peer]))); };
    dc.onclose = () => setPeers((p) => p.filter((x) => x !== peer));
    dc.onmessage = (e) => {
      if (typeof e.data === "string") {
        let m: any; try { m = JSON.parse(e.data); } catch { return; }
        if (m.kind === "chat") log({ who: m.name || peer, kind: "chat", text: m.text });
        else if (m.kind === "file-meta") incoming.current.set(peer, { name: m.name, mime: m.mime, size: m.size, buf: [] });
        else if (m.kind === "file-end") {
          const f = incoming.current.get(peer); if (!f) return;
          const blob = new Blob(f.buf, { type: f.mime || "application/octet-stream" });
          log({ who: f.name ? (m.name || peer) : peer, kind: "file", fileName: f.name, url: URL.createObjectURL(blob), size: blob.size });
          incoming.current.delete(peer);
        }
      } else {
        const f = incoming.current.get(peer); if (f) f.buf.push(e.data as ArrayBuffer);
      }
    };
  }

  function makePeer(peer: string, initiator: boolean) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    conns.current.set(peer, { pc });
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: "ice", to: peer, candidate: e.candidate }); };
    pc.onconnectionstatechange = () => { if (["failed", "closed", "disconnected"].includes(pc.connectionState)) setPeers((p) => p.filter((x) => x !== peer)); };
    if (initiator) {
      const dc = pc.createDataChannel("weizen");
      wireChannel(peer, dc);
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => send({ type: "offer", to: peer, sdp: pc.localDescription }));
    } else {
      pc.ondatachannel = (e) => wireChannel(peer, e.channel);
    }
    return pc;
  }

  function join() {
    if (!signal.trim()) { setStatus("ใส่ signalling URL ก่อน (wss://…)"); return; }
    const base = signal.replace(/\/$/, "").replace(/^http/, "ws");
    const sock = new WebSocket(`${base}/room/${encodeURIComponent(room.trim() || "lobby")}`);
    ws.current = sock;
    setStatus("กำลังเชื่อม signalling…");
    sock.onopen = () => { setStatus("เชื่อม signalling แล้ว — รอ peer"); setJoined(true); };
    sock.onclose = () => setStatus("signalling หลุด");
    sock.onerror = () => setStatus("เชื่อม signalling ไม่ได้ (เช็ค URL / worker deploy)");
    sock.onmessage = async (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "welcome") {
        self.current = m.self;
        log({ who: "ระบบ", kind: "sys", text: `เข้าห้อง "${room}" แล้ว — มี ${m.peers.length} peer อยู่ก่อน` });
        for (const p of m.peers) makePeer(p, true); // peer ใหม่ initiate หา peer เดิม
      } else if (m.type === "peer-join") {
        log({ who: "ระบบ", kind: "sys", text: `peer ${m.from} เข้าห้อง` });
      } else if (m.type === "peer-leave") {
        conns.current.get(m.from)?.pc.close(); conns.current.delete(m.from);
        setPeers((p) => p.filter((x) => x !== m.from));
        log({ who: "ระบบ", kind: "sys", text: `peer ${m.from} ออกจากห้อง` });
      } else if (m.type === "offer") {
        const pc = makePeer(m.from, false);
        await pc.setRemoteDescription(m.sdp);
        const a = await pc.createAnswer(); await pc.setLocalDescription(a);
        send({ type: "answer", to: m.from, sdp: pc.localDescription });
      } else if (m.type === "answer") {
        await conns.current.get(m.from)?.pc.setRemoteDescription(m.sdp);
      } else if (m.type === "ice") {
        try { await conns.current.get(m.from)?.pc.addIceCandidate(m.candidate); } catch {}
      }
    };
  }

  function eachChannel(fn: (dc: RTCDataChannel) => void) {
    for (const { dc } of conns.current.values()) if (dc && dc.readyState === "open") fn(dc);
  }

  function sendChat() {
    const t = draft.trim(); if (!t) return;
    eachChannel((dc) => dc.send(JSON.stringify({ kind: "chat", name: myName(), text: t })));
    log({ who: `${myName()} (ฉัน)`, kind: "chat", text: t });
    setDraft("");
  }

  async function sendFile(file: File) {
    log({ who: `${myName()} (ฉัน)`, kind: "sys", text: `กำลังส่งไฟล์ ${file.name} (${(file.size / 1024).toFixed(0)} KB)…` });
    const buf = await file.arrayBuffer();
    eachChannel((dc) => dc.send(JSON.stringify({ kind: "file-meta", name: file.name, mime: file.type, size: file.size })));
    for (let o = 0; o < buf.byteLength; o += CHUNK) {
      const slice = buf.slice(o, o + CHUNK);
      eachChannel((dc) => dc.send(slice));
    }
    eachChannel((dc) => dc.send(JSON.stringify({ kind: "file-end", name: myName() })));
    log({ who: `${myName()} (ฉัน)`, kind: "file", fileName: file.name, url: URL.createObjectURL(file), size: file.size });
  }

  useEffect(() => () => { ws.current?.close(); conns.current.forEach((c) => c.pc.close()); }, []);

  const input: React.CSSProperties = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: ".5rem .7rem", color: "var(--color-text)", fontSize: ".9rem" };

  return (
    <div className="flex flex-col gap-4">
      {!joined ? (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-semibold">Signalling URL (Durable Object worker)</label>
          <input style={input} placeholder="wss://weizen-p2p-signalling.<acct>.workers.dev" value={signal} onChange={(e) => setSignal(e.target.value)} />
          <div className="flex flex-wrap gap-3">
            <input style={{ ...input, flex: 1, minWidth: 140 }} placeholder="ชื่อห้อง" value={room} onChange={(e) => setRoom(e.target.value)} />
            <input style={{ ...input, flex: 1, minWidth: 140 }} placeholder="ชื่อคุณ" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button onClick={join} className="rounded-full px-5 py-2.5 font-semibold self-start" style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}>🔗 เข้าห้อง P2P</button>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>{status}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--color-muted)" }}>ห้อง <b style={{ color: "var(--color-text)" }}>{room}</b> · {status}</span>
            <span style={{ color: "var(--color-muted)" }}>peer ที่ต่อตรง: <b style={{ color: "var(--color-accent)" }}>{peers.length}</b></span>
          </div>
          <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 12, padding: ".8rem", height: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: ".4rem", fontSize: ".9rem" }}>
            {msgs.length === 0 && <span style={{ color: "var(--color-muted)" }}>ยังไม่มีข้อความ — ชวนเพื่อนเข้าห้องเดียวกันแล้วเริ่มแชต/โยนไฟล์ได้เลย 🍺</span>}
            {msgs.map((m, i) => (
              <div key={i} style={{ color: m.kind === "sys" ? "var(--color-muted)" : "var(--color-text)" }}>
                {m.kind === "sys" ? <em>· {m.text}</em>
                  : m.kind === "file"
                    ? <span><b style={{ color: "var(--color-accent)" }}>{m.who}</b> 📎 <a href={m.url} download={m.fileName} style={{ color: "var(--color-accent)", textDecoration: "underline" }}>{m.fileName}</a> <span style={{ color: "var(--color-muted)" }}>({((m.size || 0) / 1024).toFixed(0)} KB)</span></span>
                    : <span><b style={{ color: "var(--color-accent)" }}>{m.who}:</b> {m.text}</span>}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <input style={{ ...input, flex: 1, minWidth: 160 }} placeholder="พิมพ์ข้อความ…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} />
            <button onClick={sendChat} className="rounded-full px-4 py-2 font-semibold" style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}>ส่ง</button>
            <label className="rounded-full px-4 py-2 font-semibold border cursor-pointer" style={{ borderColor: "var(--color-border)" }}>
              📎 โยนไฟล์
              <input type="file" hidden onChange={(e) => e.target.files?.[0] && sendFile(e.target.files[0])} />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
