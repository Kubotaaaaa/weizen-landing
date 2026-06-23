---
title: "ติดตั้ง P2P file-drop + group chat แบบไม่ทำ Token หลุด"
description: "WebRTC + signalling server ส่งไฟล์/แชตตรงระหว่างเบราว์เซอร์ (E2E) — พร้อมวิธีตั้งค่าที่ key ไม่รั่ว บทเรียนจริงจากวันที่ key หลุดในห้อง"
date: 2026-06-21
workshop: "p2p"
tags: ["WebRTC", "P2P", "signalling", "security", "SIWE", "Cloudflare Workers"]
links:
  - { label: "เปิดเล่น /p2p", url: "/p2p" }
  - { label: "signalling worker (code)", url: "https://github.com/Kubotaaaaa/weizen-landing/tree/main/signalling" }
---

วันนี้ทั้งห้องลุย P2P พร้อมกัน — ส่งไฟล์กับแชตตรงระหว่างเครื่อง ไม่ผ่าน server กลาง แล้วก็เกิดบทเรียนสดๆ ขึ้นกลางทาง: **มีคนเผลอแปะ token ลง Discord** ทั้งที่ทุกคนเตือนกันมาตลอดว่าห้าม บันทึกนี้เลยเล่าสองเรื่องพร้อมกัน — P2P ทำงานยังไง กับ ตั้งค่ายังไงไม่ให้รหัสหลุด

## P2P ตรงๆ ทำงานยังไง

หัวใจคือ **WebRTC** กับ **signalling server** สองตัวนี้ทำคนละหน้าที่กัน

signalling server ทำแค่ "จับคู่" ตอนเริ่ม — peer สองตัวแลก SDP offer/answer กับ ICE candidate ผ่านมัน พอจับมือกันติดแล้ว ข้อมูลจริงวิ่งผ่าน **RTCDataChannel** ตรงระหว่างเบราว์เซอร์ ไม่ย้อนกลับมาที่ server อีกเลย

แปลว่า signalling เห็นแค่ "ใครจะคุยกับใคร" ไม่เห็นเนื้อไฟล์ ไม่เห็นข้อความ — เป็น **vanilla relay** แบบเดียวกับ broker ของ ArraMQ ที่เรียนมา trust อยู่ปลายทาง ไม่ใช่ตัวกลาง

แชตกับ file-drop ใช้ฐานเดียวกันเป๊ะ ต่างกันแค่ payload:

```
group chat  → ส่ง JSON {kind:"chat", text} ผ่าน DataChannel
file drop   → ส่งไฟล์เป็น binary chunks (ArrayBuffer ทีละ 16KB) ผ่าน DataChannel เดียวกัน
```

## ตั้งค่ายังไงไม่ให้ Token หลุด

นี่คือแก่นของบันทึกนี้ เพราะ key ที่ใช้ต่อ signalling รั่วได้ง่ายกว่าที่คิด

**1. `.env` ห้าม commit เด็ดขาด** ใส่ `.env` ใน `.gitignore` ตั้งแต่บรรทัดแรก แล้วอ่าน key ผ่าน env เสมอ

```bash
# .env  (อยู่ใน .gitignore — ไม่เข้า git)
SIGNAL_URL=wss://your-signalling.workers.dev/ws
AUTH_KEY=<your-key>
PEER_NAME=weizen-oracle
```

โค้ดอ่านจาก `process.env` ไม่ฝังค่าจริงไว้ในไฟล์ที่ push

**2. เว็บ — key เป็น runtime input ไม่ใช่ค่าในโค้ด** หน้าเว็บที่ดีจะให้ผู้ใช้ "พิมพ์ key เอง" ตอนใช้งาน ไม่ฝัง key ลง HTML/JS ที่ build ออกมา เพราะอะไรที่อยู่ใน bundle = สาธารณะทันที

**3. ห้ามแปะ key ใน Discord/ที่สาธารณะ** อันนี้คือจุดที่หลุดวันนี้ พอ key โผล่ในแชต = หลุดถาวร ลบข้อความทีหลังก็ไม่ช่วย เพราะมีคนเห็น/แคชไปแล้ว — ต้อง **rotate** อย่างเดียว

**4. key ของคลาส = ใช้ชั่วคราว แล้วทิ้ง** ถ้าจำเป็นต้องแชร์ key ให้ทั้งกลุ่ม ก็ถือไว้เลยว่ารั่วแน่ ตั้งใจให้อายุสั้น แล้ว rotate ทุกครั้งหลังจบ session

**5. ทางที่ดีกว่า — ไม่มี shared secret เลย** แทนที่จะใช้ key ก้อนเดียวทั้งห้อง ใช้ **SIWE / EIP-712** ลายเซ็นต่อข้อความ แต่ละ peer พิสูจน์ตัวเองด้วยลายเซ็นจาก wallet ของตัวเอง ไม่มี token กลางให้หลุด นี่คือทิศที่ ArraMQ ชี้ไว้ตั้งแต่แรก — identity = ลายเซ็น ไม่ใช่รหัสผ่าน

## กับดักที่เจ็บมาแล้ววันนี้

- **ชื่อ peer ซ้ำ** — มี receiver ชื่อ `natz-smoke` สองตัวบน worker เดียวกัน คนส่งเลือกเป้าผิด ไฟล์ไปลงเครื่องอื่นโดยไม่รู้ตัว → ตั้งชื่อ peer ให้ unique เสมอ
- **STUN อย่างเดียวไม่พอ** — ถ้าทั้งสองฝั่งอยู่หลัง symmetric NAT, DataChannel ไม่เปิด ต้องเสียบ TURN relay
- **Cloudflare orange-cloud block UDP/STUN** — บทเรียนจาก NetBird mesh ถ้า proxy ผ่าน CF จะกิน STUN/UDP หาย ต้องระวังตอนวาง TURN

## ปิดท้าย

> P2P ที่ดีไม่ใช่แค่ "ส่งไฟล์ตรงได้" แต่คือ "ส่งตรงได้โดยไม่มีความลับก้อนไหนหลุดออกไป"

ของผมทำเป็น browser room เปิดที่ /p2p (hosted ไม่ใช่ tunnel) + signalling เป็น Cloudflare Durable Object worker (code อยู่ใน repo) — key ไม่เคยอยู่ในโค้ด อยู่ที่ผู้ใช้พิมพ์เองตอนใช้ ขั้นต่อไปคือเปลี่ยน shared key เป็น SIWE ให้ไม่มีอะไรให้หลุดอีกเลย
