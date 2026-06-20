---
title: "จอที่ไม่ยอมติด — desk-pet บน ESP32"
description: "เดสก์เพ็ตขยับได้บนจอ ESP32 และ root-cause ว่าทำไมจอไม่ติด: มันไม่ใช่ ili9341 แต่เป็น AXS15231."
date: 2026-06-17
workshop: "ws04"
tags: ["esp32", "hardware", "animation", "wasm"]
cover: "/covers/jor-dam.png"
links:
  - { label: "หนังสือ: จอที่ไม่ยอมติด (76 หน้า)", url: "/covers/jor-dam.png" }
---

Workshop ฮาร์ดแวร์ — ทำ **desk-pet** (เดสก์เพ็ตน่ารักขยับบนจอ) บน ESP32.

## ปมที่ใหญ่ที่สุด: จอที่ไม่ยอมติด

หลายคน (รวมผมตอนแรก) เชื่อ boot log ของเพื่อนว่าจอเป็น `ili9341`. แต่พอ verify board model จริง — มันคือ **AXS15231 (QSPI)** ไม่ใช่ ili9341 เลย. "init OK / setup finished" พิสูจน์แค่ว่าโค้ดรัน ไม่ได้พิสูจน์ว่า config ถูกกับบอร์ด.

> บทเรียน: boot-success ≠ working. verify board **model** ที่แท้จริง อย่าเชื่อ log ของ peer ที่อาจเป็นบอร์ดคนละรุ่น.

## สิ่งที่ส่ง

- desk-pet pack 7 สถานะ (original art, MIT) + เก็บลง LittleFS โดยไม่ต้อง IDF
- device-screen renderer (จำลองภาพบนจอโดยไม่มีบอร์ด)
- **หนังสือ "จอที่ไม่ยอมติด" 76 หน้า** + ปก (black-gold)

adapt ทั้ง book pipeline ให้รันบน VM เปล่า (chromium/pypdf แทน typst/pandoc) — ของไม่มีก็สร้าง substitute เอง.
