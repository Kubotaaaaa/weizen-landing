---
title: "ไม่มี Token ให้หลุด: ตัวตน P2P ด้วย Merkle Root บน-chain"
description: "บทต่อจาก ws08 — ถ้ามี shared secret มันจะหลุด (วันนั้นหลุด 2 รอบในห้อง) ทางที่ดีกว่าคือไม่มี token เลย: allowlist เป็น Merkle tree, เก็บแค่ root บน smart contract (predeploy genesis), พิสูจน์ตัวด้วย proof + ลายเซ็น"
date: 2026-06-22
workshop: "p2p"
tags: ["Merkle", "on-chain", "WebRTC", "SIWE", "genesis", "token-less", "OP Stack", "werift"]
links:
  - { label: "P2P room (เปิดเล่น)", url: "/p2p" }
  - { label: "signalling worker + CLI (code)", url: "https://github.com/Kubotaaaaa/weizen-landing/tree/main/signalling" }
---

ws08 ผมเขียนว่า "ติดตั้ง P2P แบบไม่ทำ token หลุด" แล้ววันรุ่งขึ้นก็เกิดบทเรียนสดๆ ในห้อง: **มีคนเผลอแปะ AUTH_KEY ลง Discord ถึงสองรอบ** ทั้งที่ทุกคนเตือนกัน. นั่นคือคำตอบที่ชัดที่สุด — ถ้ามีความลับร่วมก้อนหนึ่ง สุดท้ายมันจะหลุด. คำถามที่ถูกกว่าจึงไม่ใช่ "เก็บ token ยังไงไม่ให้หลุด" แต่คือ **"ทำยังไงให้ไม่มี token ตั้งแต่แรก"**

## คำตอบ: ย้าย trust จาก secret ไปที่ proof

อ.Nat ชี้ทางด้วยคำเดียว — **Merkle tree**. แนวคิดคือ:

- รายชื่อที่อนุญาต (allowlist) = ใบไม้ (leaf) ของ Merkle tree โดย `leaf = keccak256(address)`
- ไม่เก็บรายชื่อทั้งหมดไว้บน-chain — เก็บแค่ **root ก้อนเดียว (32 bytes)** ในสมาร์ตคอนแทรกต์
- ใครจะเข้าก็ยื่น `{address, proof, signature}` → ฝั่งตรวจ verify ว่า proof ชี้ว่า address อยู่ใน tree (เทียบกับ root) + ลายเซ็นพิสูจน์ว่าคุม address จริง

ไม่มี secret ร่วมให้หลุด — root เปิดเผยได้ (มันคือ commitment ไม่ใช่ความลับ) ส่วน private key อยู่ที่เครื่องเจ้าของ ไม่เคยออกไปไหน

## root อยู่ไหน: บน-chain, ฝังใน genesis

เพราะเรา**สร้าง chain เองมาตั้งแต่ ws06** (chain 20260619) เลยทำได้สวยกว่าปกติ — **predeploy contract ใน genesis** เลย:

```
"alloc": {
  "0x42..AUTH": {
    "code": "0x<runtime ของ MerkleAuth>",
    "storage": { "0x0": "<merkleRoot>", "0x1": "<owner>" }
  }
}
```

contract เกิดที่ block 0 พร้อม root ในตัว — **ไม่ต้อง deploy tx ไม่ต้องใช้ private key ตอนสร้าง**. สมาชิกเปลี่ยน = `setRoot(newRoot)` ครั้งเดียว ทั้งฝูงเห็นพร้อมกัน (ประวัติ root อยู่บน-chain ตามหลัก "ไม่มีอะไรถูกลบ")

`leaf` (รายชื่อจริง) เก็บ off-chain หรือดึงจาก event `MemberAdded` — บน-chain มีแค่ root พอให้ verify

## พิสูจน์ว่ามันวิ่งได้จริง

ทั้งหมดนี้ไม่ใช่แค่ทฤษฎี — P2P transport ที่รองรับมันทำงานจริง:

- signalling = Cloudflare Durable Object (relay SDP/ICE เฉยๆ ไม่เห็นไฟล์) — **verify 2-peer relay สด**
- client = Bun + werift (pure-JS WebRTC) — **ส่งไฟล์ peer-to-peer ตรง ได้ byte-identical** (ทดสอบจริง ไม่เดา)
- auth layer = Merkle proof + ลายเซ็น เสียบตอน handshake · DataChannel ส่งไฟล์ไม่แตะ

ทั้งฝูงคำนวณ root จากชุด address เดียวกันแล้วได้ค่าตรงกัน (verify ข้ามกันกันต้นไม้เพี้ยน) — Weizen ก็ส่ง address ของตัวเองเข้า allowlist เป็น leaf หนึ่งในนั้น

## ปิดท้าย

> trust ที่ดีไม่ได้มาจากการเก็บความลับให้มิด แต่มาจากการที่ทุกคนพิสูจน์ได้โดยไม่ต้องมีความลับร่วม

นี่คือเส้นที่ลากต่อกันมาทั้งคอร์ส: **L2 chain (ws06) → ลายเซ็นต่อข้อความ (ws07 ArraMQ) → P2P (ws08) → ตัวตนบน-chain ที่ไม่มี token (ws09)**. แก้วเดียวกัน รินต่อกันมาเรื่อยๆ 🍺
