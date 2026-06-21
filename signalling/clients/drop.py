#!/usr/bin/env python3
"""Weizen P2P drop — Python (aiortc) client for the token-less signalling worker.

ต่อ wss://weizen-p2p-signalling.weizen.workers.dev/room/<room> (open relay, ไม่มี token)
แล้วคุย WebRTC DataChannel ตรงระหว่าง peer — ส่งไฟล์เป็น binary chunks (E2E).
aiortc ใส่ ICE candidate ใน SDP ให้เลย (non-trickle) → แลกแค่ offer/answer ผ่าน worker พอ.

ติดตั้ง:  python3 -m venv .venv && . .venv/bin/activate && pip install aiortc websockets
ใช้:
  python3 drop.py recv --room arra --name weizen-recv
  python3 drop.py send --room arra --name weizen --to weizen-recv --file ./hello.txt
"""
import asyncio, json, os, argparse
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription

SIGNAL = "wss://weizen-p2p-signalling.weizen.workers.dev/room/"
ICE_CFG = None  # aiortc ใช้ STUN default; ตั้ง RTCConfiguration ได้ถ้าต้องการ TURN
CHUNK = 16 * 1024


async def run(mode, room, name, to=None, path=None):
    ws = await websockets.connect(SIGNAL + room, max_size=None)
    pcs = {}              # peerId -> RTCPeerConnection
    self_id = None
    done = asyncio.Event()

    async def send(obj): await ws.send(json.dumps(obj))

    def new_pc(peer):
        pc = RTCPeerConnection()
        pcs[peer] = pc
        return pc

    async def wire_recv(channel):
        meta = {}
        f = None
        @channel.on("message")
        def on_msg(msg):
            nonlocal f, meta
            if isinstance(msg, str):
                m = json.loads(msg)
                if m.get("kind") == "file-meta":
                    meta = m
                    os.makedirs("inbox", exist_ok=True)
                    f = open(os.path.join("inbox", os.path.basename(m["name"])), "wb")
                    print(f"[recv] start {m['name']} ({m['size']} B)")
                elif m.get("kind") == "file-end":
                    if f: f.close()
                    print(f"[recv] ✅ saved inbox/{os.path.basename(meta.get('name','file'))}")
                    done.set()
            else:
                if f: f.write(msg)

    async def do_send(peer):
        pc = new_pc(peer)
        ch = pc.createDataChannel("weizen")
        @ch.on("open")
        async def on_open():
            data = open(path, "rb").read()
            ch.send(json.dumps({"kind": "file-meta", "name": os.path.basename(path), "size": len(data)}))
            for i in range(0, len(data), CHUNK):
                ch.send(data[i:i + CHUNK])
            ch.send(json.dumps({"kind": "file-end", "name": name}))
            print(f"[send] ✅ sent {os.path.basename(path)} ({len(data)} B) -> {peer}")
            await asyncio.sleep(0.5)
            done.set()
        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await send({"type": "offer", "to": peer, "sdp": {"type": pc.localDescription.type, "sdp": pc.localDescription.sdp}})

    async for raw in ws:
        m = json.loads(raw)
        t = m.get("type")
        if t == "welcome":
            self_id = m["self"]
            print(f"[ok] connected as {name} ({self_id}); peers={m['peers']}")
            if mode == "send":
                # หา target จาก peers ที่ออนไลน์ (ในเดโมนี้ join ก่อน = เห็นใน peers)
                if not m["peers"]:
                    print("[send] ยังไม่มี peer ในห้อง — ให้ผู้รับ join ก่อน"); break
                await do_send(m["peers"][-1])
        elif t == "peer-join" and mode == "send" and path:
            await do_send(m["from"])
        elif t == "offer":
            pc = new_pc(m["from"])
            @pc.on("datachannel")
            def on_dc(channel): asyncio.ensure_future(wire_recv(channel))
            await pc.setRemoteDescription(RTCSessionDescription(**m["sdp"]))
            ans = await pc.createAnswer()
            await pc.setLocalDescription(ans)
            await send({"type": "answer", "to": m["from"], "sdp": {"type": pc.localDescription.type, "sdp": pc.localDescription.sdp}})
        elif t == "answer":
            await pcs[m["from"]].setRemoteDescription(RTCSessionDescription(**m["sdp"]))
        if done.is_set():
            break

    for pc in pcs.values(): await pc.close()
    await ws.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["send", "recv"])
    ap.add_argument("--room", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--to")
    ap.add_argument("--file")
    a = ap.parse_args()
    asyncio.run(run(a.mode, a.room, a.name, a.to, a.file))
