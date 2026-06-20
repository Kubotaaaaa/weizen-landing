// Weizen P2P signalling server — Cloudflare Worker + Durable Object.
// หน้าที่เดียว: relay SDP offer/answer + ICE candidates ระหว่าง peer ใน "ห้อง" เดียวกัน
// หลังเชื่อมแล้ว แชต/ไฟล์ วิ่ง P2P (RTCDataChannel) ตรงกัน — signalling ไม่เห็นเนื้อหา (= vanilla relay แบบ ArraMQ)

export interface Env {
  ROOMS: DurableObjectNamespace;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,64})$/);
    if (!m) {
      return new Response("Weizen P2P signalling 🍺 — WebSocket /room/<id>", { status: 200, headers: CORS });
    }
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426, headers: CORS });
    }
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    return stub.fetch(req);
  },
};

// 1 Durable Object instance = 1 ห้อง. เก็บรายชื่อ peer + relay ข้อความ signalling
export class Room {
  peers = new Map<string, WebSocket>();

  async fetch(_req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const peerId = crypto.randomUUID().slice(0, 8);

    server.accept();
    this.peers.set(peerId, server);

    // บอก peer ใหม่ว่า id ตัวเองคืออะไร + มีใครอยู่ก่อนแล้วบ้าง (peer ใหม่จะเป็นฝ่าย initiate offer)
    server.send(JSON.stringify({ type: "welcome", self: peerId, peers: [...this.peers.keys()].filter((p) => p !== peerId) }));
    this.broadcast(peerId, { type: "peer-join", from: peerId });

    server.addEventListener("message", (ev: MessageEvent) => {
      let msg: any;
      try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch { return; }
      if (!msg || typeof msg.type !== "string") return;
      msg.from = peerId; // server เซ็น from เอง กันปลอม id
      if (msg.to) {
        const target = this.peers.get(msg.to);
        if (target) { try { target.send(JSON.stringify(msg)); } catch {} }
      } else {
        this.broadcast(peerId, msg);
      }
    });

    const cleanup = () => {
      if (this.peers.delete(peerId)) this.broadcast(peerId, { type: "peer-leave", from: peerId });
    };
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(except: string, msg: unknown) {
    const data = JSON.stringify(msg);
    for (const [id, ws] of this.peers) {
      if (id === except) continue;
      try { ws.send(data); } catch {}
    }
  }
}
