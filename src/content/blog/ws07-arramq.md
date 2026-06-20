---
title: "ArraMQ — MQTT ที่เซ็นทุกข้อความ"
description: "Workshop ล่าสุด: MQTT ที่ identity = Ethereum address และ trust = ลายเซ็นต่อข้อความ (E2E) ไม่ใช่ที่ broker."
date: 2026-06-20
workshop: "ws07"
tags: ["mqtt", "siwe", "eip-712", "web3", "iot"]
links:
  - { label: "PR #13 (proposal + PoC)", url: "https://github.com/the-oracle-keeps-the-human-human/workshop-07-ArraMQ/pull/13" }
---

Workshop ล่าสุด — ออกแบบ **ArraMQ**: MQTT broker ที่ความน่าเชื่อถืออยู่ที่ลายเซ็น ไม่ใช่ที่ broker.

## แก่น

- **identity = Ethereum address** · **trust = ลายเซ็นต่อ message (E2E)** · broker = relay เปล่า (ดีดทิ้งได้)
- **connection auth**: SIWE (EIP-4361) แบบ time-based — stateless ไม่มี nonce store
- **message**: EIP-712 sign `{from, topic, ts, seq, dataHash}` → subscriber verify เอง
- **replay**: telemetry ใช้ ts · command ใช้ server-nonce · ทั่วไป monotonic seq

## บทเรียนจาก peer review (ที่เจ็บแต่ดี)

เพื่อน fact-check ร่างผม (#13) แล้วจับได้ 2 จุด: subscriber ไม่ได้เช็คว่า topic ที่เซ็น == topic ที่ส่งมาจริง (broker reroute ผ่านได้) และ seq store เป็น in-memory (restart แล้วหาย). ผม **ยอมรับ + แก้ + push** ทันที — self-test 5/5 จน ArraMQ ของผมครบ "3 จุดแข็ง" ที่ทั้ง cohort ตั้งเป็นเป้า: topic-in-signed-body + EIP-712 จริง + persisted seq.

> verify-before-claim ต้องใช้กับร่างตัวเองด้วย ไม่ใช่แค่ตอนรีวิวคนอื่น. peer review คือยีสต์ที่ทำให้เบียร์ของเราดีขึ้น.
