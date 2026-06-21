#!/usr/bin/env bun
/**
 * Weizen P2P drop — Bun + werift CLI (token-less).
 * ต่อ open signalling worker → WebRTC DataChannel → ส่งไฟล์ตรงระหว่าง peer (E2E).
 * werift = pure-JS WebRTC (ไม่ต้อง native build) · non-trickle (ICE ฝังใน SDP).
 *
 * ติดตั้ง:  bun install      (ลง werift)
 * ใช้:
 *   bun drop.ts recv --room arra --name weizen-recv
 *   bun drop.ts send --room arra --name weizen --to weizen-recv --file ./hello.txt
 *   (--to ละได้ = auto-pick peer แรกในห้อง · SIGNAL_URL override ได้ผ่าน env)
 */
import { RTCPeerConnection } from "werift";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { basename, join } from "path";

const SIGNAL = process.env.SIGNAL_URL || "wss://weizen-p2p-signalling.weizen.workers.dev/room/";
const STUN = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }] };
const CHUNK = 16 * 1024;

const mode = process.argv[2];
const arg = (k: string) => { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : undefined; };
const room = arg("room") || "weizen-lobby";
const name = arg("name") || "weizen-" + Math.floor(Math.random() * 9999);
const to = arg("to");
const file = arg("file");

if (mode !== "recv" && mode !== "send") {
  console.log("usage: bun drop.ts <recv|send> --room <r> --name <n> [--to <peer> --file <path>]");
  process.exit(1);
}

async function gather(pc: any, desc: any) {
  await pc.setLocalDescription(desc);
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>((res) => pc.iceGatheringStateChange.subscribe((s: string) => s === "complete" && res()));
  }
  return pc.localDescription;
}

const ws = new WebSocket(SIGNAL + encodeURIComponent(room));
const sendWs = (o: any) => ws.send(JSON.stringify(o));
const pcs = new Map<string, any>();

function recvChannel(dc: any) {
  let meta: any = {}; const buf: Buffer[] = [];
  dc.onMessage.subscribe((data: any) => {
    if (typeof data === "string") {
      const m = JSON.parse(data);
      if (m.kind === "file-meta") { meta = m; console.log(`[recv] start ${m.name} (${m.size} B)`); }
      else if (m.kind === "file-end") {
        mkdirSync("inbox", { recursive: true });
        const out = join("inbox", basename(meta.name || "file"));
        writeFileSync(out, Buffer.concat(buf));
        console.log(`[recv] ✅ saved ${out} (${Buffer.concat(buf).length} B)`);
      }
    } else { buf.push(Buffer.from(data)); }
  });
}

async function sendTo(peer: string) {
  const pc = new RTCPeerConnection(STUN as any); pcs.set(peer, pc);
  const dc = pc.createDataChannel("weizen");
  dc.stateChanged.subscribe((st: string) => {
    if (st === "open") {
      const data = readFileSync(file!);
      dc.send(JSON.stringify({ kind: "file-meta", name: basename(file!), size: data.length }));
      for (let i = 0; i < data.length; i += CHUNK) dc.send(data.subarray(i, i + CHUNK));
      dc.send(JSON.stringify({ kind: "file-end", name }));
      console.log(`[send] ✅ sent ${basename(file!)} (${data.length} B) → ${peer}`);
      setTimeout(() => process.exit(0), 800);
    }
  });
  const offer = await gather(pc, await pc.createOffer());
  sendWs({ type: "offer", to: peer, sdp: { type: offer.type, sdp: offer.sdp } });
}

ws.onopen = () => console.log(`[${mode}] connecting room "${room}" as ${name}…`);
ws.onmessage = async (ev: any) => {
  const m = JSON.parse(ev.data);
  if (m.type === "welcome") {
    console.log(`[ok] ${name} (${m.self}) · peers=${JSON.stringify(m.peers)}`);
    if (mode === "send") {
      const target = to && m.peers.includes(to) ? to : m.peers[m.peers.length - 1];
      if (!target) { console.log("[send] ยังไม่มี peer ในห้อง — ให้ผู้รับ join ก่อน"); process.exit(1); }
      await sendTo(target);
    }
  } else if (m.type === "peer-join" && mode === "send" && file && to === m.from) {
    await sendTo(m.from);
  } else if (m.type === "offer") {
    const pc = new RTCPeerConnection(STUN as any); pcs.set(m.from, pc);
    pc.onDataChannel.subscribe((dc: any) => recvChannel(dc));
    await pc.setRemoteDescription(m.sdp);
    const answer = await gather(pc, await pc.createAnswer());
    sendWs({ type: "answer", to: m.from, sdp: { type: answer.type, sdp: answer.sdp } });
  } else if (m.type === "answer") {
    await pcs.get(m.from)?.setRemoteDescription(m.sdp);
  }
};
if (mode === "recv") console.log("[recv] เฝ้ารับไฟล์ลง ./inbox — Ctrl-C เพื่อออก");
