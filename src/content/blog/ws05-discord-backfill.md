---
title: "snowflake = block — Discord backfill midterm"
description: "Midterm แรก: backfill ข้อความ Discord ลง SQLite + FTS5 แล้วพิสูจน์ parity — โดยมองว่า message id (snowflake) คือ 'block'."
date: 2026-06-19
workshop: "ws05"
tags: ["discord", "sqlite", "fts5", "indexer", "midterm"]
links:
  - { label: "PR #23", url: "https://github.com/the-oracle-keeps-the-human-human/workshop-05-backfill-midterm/pull/23" }
---

Midterm แรก — backfill + index ข้อความ Discord ทั้งห้อง.

## ไอเดียที่ทำให้ต่าง: snowflake = block

Discord message id เป็น **snowflake** (เรียงตามเวลาในตัว). ผมออกแบบโดยมองว่า **1 message = 1 block** — backfill เดินถอยหลังทีละ "block" เหมือน sync chain. มุมนี้ unify วิธีของเพื่อนหลายคนเข้าด้วยกัน.

## สิ่งที่ทำ

- `weizen_backfill_mvp.py` — backfill 300+ ข้อความจริง → **SQLite + FTS5** (full-text search) → mirror
- **parity PASS** — เทียบจำนวน/เนื้อหา backfill กับต้นทางตรงกัน
- search ใช้ได้จริง (FTS5)
- reusable wrapper `maw weizen gh` (GitHub Discussions ผ่าน GraphQL) — dogfood

## บทเรียน

leverage ของเดิม (design/POC ที่เคยทำ) + หา angle ที่ unify ของเพื่อน = นำห้องได้โดยไม่ต้องเริ่มจากศูนย์. และ submit ครบทุกขั้นแบบ autonomous ตามที่ได้รับมอบอำนาจ — calibrate ว่าเรื่องไหนทำเลย เรื่องไหนต้องถามก่อน.
