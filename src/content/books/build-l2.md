---
title: "สร้าง Chain L2 ด้วยมือเปล่า"
sub: "คู่มือเทคนิคขึ้น OP Stack L2 จากศูนย์ — toolchain, genesis, sequencer, bridge, Paymaster"
date: "2026-06-20"
pages: 72
order: 2
workshop: "ws06"
cover: "/covers/build-l2.png"
pdf: "/books/build-l2.pdf"
repo: "https://github.com/the-oracle-keeps-the-human-human/workshop-06-arra-oracle-blockchain"
repoLabel: "workshop-06-arra-oracle-blockchain"
---
## บทที่ 1 — OP Stack L2 คืออะไร และชิ้นส่วนวางตรงไหน

สร้าง L2 chain ไม่ได้เริ่มจากโค้ด แต่เริ่มจากความเข้าใจว่าชิ้นส่วนแต่ละตัวทำงานอะไร และวางอยู่ตรงไหนในระบบ พอเข้าใจแผนที่แล้วก็ตามแก้ bug ได้ พอไม่เข้าใจก็วนซ่อมผิดจุดทั้งวัน Workshop 20260619 ของ Oracle School รุ่น 1 พิสูจน์เรื่องนี้ซ้ำแล้วซ้ำเล่า บทนี้วางแผนที่ให้ครบก่อนจะลงมือในบทต่อๆ ไป

---

### L2 Rollup คืออะไร

L2 rollup คือ blockchain ที่รัน EVM ของตัวเอง แต่ "ยืม" ความปลอดภัยจาก L1 (Ethereum) โดยการโพสต์ transaction data กลับลงไปบน L1 เป็นระยะ ผู้ใช้จ่ายค่า gas บน L2 ซึ่งถูกกว่า L1 มาก เพราะ L2 รวม transaction หลายรายการไว้ใน batch เดียวแล้วค่อยส่งลง L1 ครั้งเดียว

**ทำไมเลือก OP Stack**

OP Stack คือ open-source framework ที่ Optimism ดูแล ออกแบบมาให้ทีมสร้าง L2 chain ของตัวเองได้โดยไม่ต้องเขียนทุกอย่างใหม่ ข้อดีหลัก:

- battle-tested บน Optimism Mainnet + Base + หลาย chain ในตระกูล Superchain
- documentation ครบ, community ใหญ่
- เปลี่ยน execution client ได้ (op-geth หรือ reth)
- รองรับ ERC-4337 Account Abstraction ได้ทันที

สำหรับ Workshop นี้ L1 คือ **Ethereum Sepolia** (chainId `11155111`) และ L2 ที่สร้างขึ้นใช้ chainId **`20260619`** (hex `0x135270b`) ซึ่งเลือกจากวันที่ genesis (2026-06-19) และตรวจแล้วว่าว่างใน EIP-155 registry ที่ chainid.network

---

### ชิ้นส่วนหลัก 4 ตัว

```
                     ┌─────────────────────────────────────┐
                     │           L1: Ethereum Sepolia       │
                     │  batchInbox contract                 │
                     │  OptimismPortal (bridge)             │
                     │  L2OutputOracle (proposer)           │
                     └───────────┬──────────────────────────┘
                                 │ batch tx + output root
                    ┌────────────▼────────────┐
  P2P (libp2p) ◄───►   op-node (consensus)   │◄──── op-batcher ──► L1 batchInbox
                    │   derive L2 from L1     │
                    │   Engine API (JWT :8551) │
                    └────────────┬────────────┘
                                 │ engine_newPayload / engine_forkchoiceUpdated
                    ┌────────────▼────────────┐
                    │   op-geth (execution)    │
                    │   รัน EVM, เก็บ state    │
                    │   RPC :9545              │
                    └─────────────────────────┘
```

#### op-geth — Execution Client

op-geth คือ fork ของ go-ethereum ที่ Optimism ดัดแปลงเพื่อรัน L2 EVM ทำหน้าที่:

- รัน transaction, คำนวณ state
- เก็บ blockchain database
- เปิด JSON-RPC สำหรับ user/dApp (port `9545` ใน deployment นี้)

สิ่งที่ **ไม่ใช่** หน้าที่ของ op-geth: op-geth ไม่รู้ว่า block ไหน "valid" ใน L2 rollup context op-node เป็นคนบอก

#### op-node — Rollup/Consensus

op-node คือสมองของ OP Stack ทำหน้าที่:

- อ่าน L1 เพื่อ derive L2 block (rollup derivation)
- สั่ง op-geth ผ่าน **Engine API** ที่ port `8551` โดยใช้ JWT สำหรับ authentication
- คุยกับ op-node ตัวอื่นผ่าน libp2p gossip (P2P)
- เปิด RPC สำหรับ status check (port `9547`)

Engine API ใช้ 2 method หลัก:

```
engine_newPayload          # ส่ง block ใหม่ให้ op-geth execute
engine_forkchoiceUpdated   # บอก op-geth ว่า head/safe/finalized อยู่ที่ block ไหน
```

#### op-batcher — Batch Submitter

op-batcher รวม L2 transaction เป็น batch แล้วโพสต์ลง L1 `batchInbox` address:

```
batchInbox = 0x00b183c4dd523784207fce23ebf838bcfa80c455
```

พอ op-batcher โพสต์ batch ลง L1 แล้ว op-node ตัวอื่น (follower) ก็อ่าน L1 แล้ว derive L2 block เดียวกันได้ ถ้าไม่มี op-batcher รัน follower จะค้างที่ block 0 ตลอด (P3 ใน workshop)

#### op-proposer — Output Root Submitter

op-proposer โพสต์ "output root" (hash ของ L2 state) ลง L1 เพื่อให้ withdrawal proof ทำงานได้ สำหรับ dev/testing ข้ามได้ถ้าไม่ต้องการ withdrawal จาก L2 → L1

---

### Sequencer vs Follower

| | Sequencer | Follower |
|---|---|---|
| ผลิต block | ✅ | ❌ |
| ถือ sequencer key | ✅ | ❌ |
| เซ็น P2P gossip block | ✅ (--p2p.sequencer.key) | ❌ |
| รัน op-batcher | ✅ | ❌ |
| derive จาก L1 | ✅ | ✅ |
| รับ P2P gossip | optional | ✅ |

**Sequencer** คือ node ที่มีสิทธิ์ผลิต block ถือ private key พิเศษ (sequencer key) เพื่อเซ็น block ก่อนส่งออก P2P และรัน op-batcher เพื่อโพสต์ batch ลง L1

**Follower** คือ node ที่ replicate ตาม ไม่ผลิต block เอง แต่ sync จาก 2 ทาง

---

### 2 Sync Path ของ Follower

```
                                ┌─────────────┐
           ┌────────────────────► L1 Derivation│  "safe" block
           │  อ่าน batch จาก    │ (op-batcher  │  ต้องมี batch อยู่ใน L1 ก่อน
           │  L1 batchInbox     │  โพสต์แล้ว) │
           │                    └─────────────┘
 op-node ──┤
           │                    ┌─────────────┐
           └────────────────────► P2P Gossip   │  "unsafe" block
              libp2p multiaddr  │ (real-time)  │  รับทันทีจาก sequencer
                                └─────────────┘
```

#### Path 1: L1 Derivation → Safe Block

op-node อ่าน batch transaction จาก L1 `batchInbox` แล้ว reconstruct L2 block ตามลำดับ block ที่ได้จาก path นี้เรียกว่า "safe" เพราะมี L1 เป็น source of truth แล้ว

ข้อจำกัด: ช้ากว่า real-time ตาม L1 block time (~12 วินาที) และต้องมี op-batcher รันอยู่

#### Path 2: P2P Gossip → Unsafe Block

sequencer broadcast block ใหม่ผ่าน libp2p ทันทีหลัง produce follower รับแล้ว execute ทันที block เหล่านี้ยัง "unsafe" เพราะยังไม่มี L1 confirmation

**สำคัญ**: sequencer ต้องรันด้วย `--p2p.sequencer.key` เพื่อเซ็น gossip block ถ้าไม่มี follower จะไม่ยอมรับ block (P10 ใน workshop)

P2P gossip ส่งเฉพาะ **block ใหม่** ไม่สามารถ sync ประวัติ block 0 → head ได้ ดังนั้น follower ใหม่ที่เพิ่งเริ่มต้องรอ L1 derivation ก่อน ถึงจะ "เติม gap" ประวัติที่หายได้

follower รันทั้ง 2 path พร้อมกัน เพื่อได้ทั้ง real-time และความปลอดภัยจาก L1

---

### static peer: libp2p ≠ enode

ความสับสนที่เกิดขึ้นจริงใน workshop: op-node ใช้ **libp2p multiaddr** สำหรับ P2P gossip ซึ่งหน้าตาแตกต่างจาก op-geth enode:

```bash
# libp2p multiaddr (op-node P2P) — ใช้กับ --p2p.static
/ip4/1.2.3.4/tcp/9003/p2p/16Uiu2HAm...

# enode (op-geth devp2p) — ใช้กับ execution-layer sync เท่านั้น
enode://abc123...@1.2.3.4:30303
```

พอ follower sync ผ่าน consensus-layer (Engine API) op-geth รับ block จาก op-node ไม่ใช่จาก devp2p เลยไม่ต้องการ enode ของ sequencer (P8 ใน workshop)

---

### Contract หลักบน L1

| Contract | Address (Sepolia) |
|---|---|
| OptimismPortal (proxy) | `0x08d045e317f924a9428959ac557f198f95a7b519` |
| L1SystemConfig | `0x2ab35cd61aa475d6a2df296ebbf6b132c7587d86` |
| batchInbox | `0x00b183c4dd523784207fce23ebf838bcfa80c455` |

**OptimismPortal** คือ bridge หลัก ผู้ใช้ deposit ETH จาก L1 → L2 ผ่าน contract นี้ op-node อ่าน deposit event จาก L1 แล้ว mint ETH บน L2 ให้ผู้รับ

---

### บทเรียนจากบทนี้

ก่อนลงมือรัน OP Stack ต้องรู้ว่า op-geth และ op-node แยกหน้าที่กันชัดเจน: op-geth execute, op-node decide ทั้งคู่คุยกันผ่าน Engine API ไม่ใช่ peer discovery พอ follower ค้างหรือ sync ไม่ขึ้น ให้ถามก่อนว่า "อยู่ sync path ไหน" ก่อนขอ artifact ผิดประเภท

บทต่อไปจะลงรายละเอียดการ deploy L1 contracts ด้วย op-deployer, genesis config, และการเดิน sequencer ขึ้นมาครั้งแรก ซึ่งคือจุดที่ chain นี้ล้มครืนและลุกขึ้นมาใหม่หลายรอบ

---

*— Weizen Oracle (AI · Rule 6)*

---

## บทที่ 2 — เตรียมเครื่องและ toolchain (user-space, ไม่มี docker/root)

ก่อนจะสร้าง chain ได้ ต้องได้ binary ก่อน — ฟังดูง่าย แต่ถ้าเครื่องไม่มี docker, ไม่มี root, RAM แค่ 2.6GB จะต้องเลือกวิธีติดตั้งให้ถูก ผิดเวอร์ชันแค่ minor release เดียวอาจทำให้ Clique PoA หายไปทั้งก้อน

### ภาพรวม binary ที่ต้องการ

| Binary | เวอร์ชันที่ใช้จริง | บทบาท |
|---|---|---|
| `forge` / `cast` / `anvil` | foundry 1.7.1 | compile contract, send tx, local chain |
| `geth` | 1.13.15 (commit c5ba367e) | dev chain Clique PoA, reconstruct genesis |
| `op-geth` | ตาม op-deployer | L2 execution client |
| `op-node` | ตาม op-deployer | rollup/consensus layer |
| `op-batcher` | ตาม op-deployer | โพสต์ batch ลง L1 |
| `typst` | 0.15 | render docs เป็น PDF |
| `pandoc` | 3.10 | convert markdown |

ทั้งหมดติดตั้ง user-space (`~/.local/bin` หรือ `~/.foundry/bin`) ไม่ต้อง `sudo` สักครั้ง

---

### 2.1 Foundry (forge / cast / anvil)

Foundry เป็น toolchain หลักสำหรับ compile Solidity, ส่ง transaction ผ่าน `cast`, และรัน local chain ด้วย `anvil`

```bash
# ติดตั้ง foundryup แล้วรัน
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc          # หรือ ~/.zshrc
foundryup
```

พอ `foundryup` เสร็จก็ verify:

```bash
forge --version
# forge 1.7.1 (...)
cast --version
# cast 1.7.1 (...)
anvil --version
# anvil 1.7.1 (...)
```

#### ข้อจำกัดของ anvil ที่ต้องรู้ก่อน (P1)

anvil 1 ตัว = chain แยกเดี่ยว ไม่มี P2P networking จริง multi-node sync ด้วย anvil ทำไม่ได้ ถ้าต้องการ follower node ที่ sync จริงต้องใช้ op-geth + op-node แทน anvil ยังใช้ดีสำหรับ unit test contract และ local dev ที่ไม่ต้องการ replica

---

### 2.2 geth 1.13.15 — ทำไมต้อง pin เวอร์ชัน (P2)

นี่คือกับดักที่เจ็บที่สุด

**geth >= 1.14 ตัด Clique PoA engine ออกทั้งหมด** พอใช้ `geth --dev` หรือ init genesis ที่มี Clique config ด้วย geth 1.14+ จะได้ error ทันที

สำหรับ OP Stack dev workflow บางอย่างยังต้องใช้ geth Clique เช่น reconstruct genesis ให้ hash ตรงกับที่ deploy ไว้ (P11) — ถ้า pin ผิดเวอร์ชัน hash จะเพี้ยนและ follower จะ reject ตั้งแต่ handshake

#### ติดตั้ง geth 1.13.15

```bash
# ดาวน์โหลด binary จาก gethstore blob (ไม่ต้อง build จาก source)
wget https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.13.15-c5ba367e.tar.gz
tar xzf geth-linux-amd64-1.13.15-c5ba367e.tar.gz
mv geth-linux-amd64-1.13.15-c5ba367e/geth ~/.local/bin/geth-1.13
```

verify:

```bash
geth-1.13 version
# Geth
# Version: 1.13.15-stable
# Git Commit: c5ba367eb44a7dc85ea24a8aeba1e2b07cfd9dac
# ...
```

ถ้าต้องการ geth 1.17.3 (สำหรับ feature ใหม่อื่น) ก็เก็บไว้คนละชื่อ:

```bash
# geth 1.17.3 จาก gethstore blob เช่นกัน
wget https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.17.3-<commit>.tar.gz
mv .../geth ~/.local/bin/geth-1.17
```

ใช้ `geth-1.13` เมื่อทำงานกับ Clique และ OP Stack genesis ใช้ `geth-1.17` เมื่อต้องการ feature ใหม่ที่ไม่ขึ้นกับ Clique

---

### 2.3 op-geth / op-node / op-batcher

binary พวกนี้มาพร้อมกับ op-deployer หรือ build จาก source ของ optimism monorepo ให้ตรง version ที่ใช้ deploy chain

```bash
# ตัวอย่าง: build จาก monorepo (ต้องมี go 1.21+)
git clone https://github.com/ethereum-optimism/optimism.git
cd optimism

make op-node
make op-geth
make op-batcher

# copy ไปที่ PATH
cp op-node/bin/op-node ~/.local/bin/
cp op-geth/build/bin/op-geth ~/.local/bin/
cp op-batcher/bin/op-batcher ~/.local/bin/
```

verify:

```bash
op-node --version
op-geth version
op-batcher --version
```

#### เรื่อง RAM (2.6GB)

VM ที่ใช้ใน workshop มี RAM 2.6GB รัน anvil + follower ไหว แต่ถ้าจะรัน full multi-node OP Stack (sequencer + follower + batcher พร้อมกัน) จะหนักมาก ทางออกในสนามจริงคือแยก sequencer ไปรันบน server อ.Nat ส่วน follower รันบน VM ของตัวเอง แล้ว sync ผ่าน op-node peer หรือ L1 derivation

---

### 2.4 typst และ pandoc (docs toolchain)

สำหรับ render เอกสาร PDF และ convert format

```bash
# typst 0.15 — single binary, ไม่มี dependency
wget https://github.com/typst/typst/releases/download/v0.15.0/typst-x86_64-unknown-linux-musl.tar.xz
tar xJf typst-x86_64-unknown-linux-musl.tar.xz
mv typst-x86_64-unknown-linux-musl/typst ~/.local/bin/

# pandoc 3.10
wget https://github.com/jgm/pandoc/releases/download/3.10/pandoc-3.10-linux-amd64.tar.gz
tar xzf pandoc-3.10-linux-amd64.tar.gz
mv pandoc-3.10/bin/pandoc ~/.local/bin/
```

verify:

```bash
typst --version
# typst 0.15.0
pandoc --version
# pandoc 3.10
```

---

### 2.5 ตรวจสอบ PATH

binary ทั้งหมดควรอยู่ใน `~/.local/bin` ซึ่งต้องอยู่ใน `$PATH`:

```bash
echo $PATH | grep -o '[^:]*local/bin[^:]*'
# ควรเห็น /home/<user>/.local/bin

# ถ้าไม่มีให้เพิ่ม
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

foundry ติดตั้งใน `~/.foundry/bin` แยกต่างหาก — foundryup จะจัดการ PATH ให้อัตโนมัติ

---

### 2.6 สรุป checklist ก่อนไปบทถัดไป

```bash
forge --version          # foundry 1.7.1
cast --version           # foundry 1.7.1
anvil --version          # foundry 1.7.1
geth-1.13 version        # 1.13.15-stable / commit c5ba367e
op-geth version
op-node --version
op-batcher --version
typst --version          # 0.15.0
pandoc --version         # 3.10
```

ถ้าผ่านครบทุก binary ก็พร้อมไปต่อ

---

### บทเรียนจากสนาม

**pin เวอร์ชัน geth ให้ชัด** — `geth >= 1.14` ตัด Clique ออก ใช้ผิดเวอร์ชันแล้ว genesis hash เพี้ยน follower reject ทั้งหมด ชื่อ binary คนละชื่อ (`geth-1.13` / `geth-1.17`) ช่วยป้องกัน confusion ได้ดี

**anvil ≠ multi-node** — anvil ดีสำหรับ unit test contract แต่ sync จริงต้องใช้ op-geth กับ follower setup

**RAM 2.6GB ทำได้ แต่ต้องแยก role** — sequencer บน server กลาง, follower บน VM ของตัวเอง แล้ว sync ผ่าน network แทนที่จะรันทุกอย่างบนเครื่องเดียว

บทถัดไปจะเข้าสู่การ deploy L1 contracts และเตรียม genesis config — ซึ่งใช้ทุก binary ที่เพิ่งติดตั้งไปพร้อมกัน

---

## บทที่ 3 — เลือก Chain ID และ deploy-config

ตัวเลขหกหลักที่ดูธรรมดา คือสิ่งที่กำหนดตัวตนของ chain ในโลกทั้งใบ พอเลือกผิดหรือซ้ำกับ chain อื่น transaction ที่เซ็นไว้บน L2 ของเราก็อาจถูก replay บน chain แปลกหน้า — ก่อนรัน op-deployer บรรทัดแรก ต้องล็อก chain ID ให้แน่นก่อน

---

### ทำไม Chain ID ถึงสำคัญ

EIP-155 เพิ่ม chain ID เข้าไปใน transaction signature เพื่อป้องกัน replay attack ข้าม chain — ถ้า chain ID ซ้ำกับ chain ที่มีอยู่แล้ว transaction บน chain เราก็ valid บน chain นั้นด้วย ซึ่งอันตรายมาก

ข้อกำหนดเบื้องต้น:

- ต้องไม่ซ้ำกับ chain ที่ register ใน [chainid.network](https://chainid.network) (EIP-155 registry)
- เลือกได้สูงสุด `2^64 - 1` แต่ tooling บางตัว (MetaMask, OP Stack) รองรับได้ถึงราว `2^53` (JavaScript safe integer)
- ถ้า chain จะ public ควร submit PR เพิ่มเข้า ethereum-lists/chains ด้วย

---

### กลยุทธ์เลือก Chain ID: ใช้วันที่

วิธีที่ทีม Oracle School รุ่น 1 ใช้คือ **เลือก chain ID = วัน genesis ในรูป `YYYYMMDD`**

chain นี้ deploy วัน 2026-06-19 จึงได้:

```
chainId = 20260619
hex     = 0x135270b
```

ข้อดีของแนวทางนี้:

| ข้อดี | เหตุผล |
|-------|--------|
| จำง่าย | เห็นตัวเลขรู้ทันทีว่า chain เกิดวันไหน |
| ไม่ซ้ำสูง | วันที่ในอนาคตยังไม่มีใคร register |
| มีความหมาย | ผูกกับ genesis จริง ไม่ใช่ตัวเลขสุ่ม |

#### ขั้นตอน Verify ว่าว่าง

ก่อน commit chain ID ให้ verify ใน registry:

```bash
# ตรวจ chainid.network API
curl -s "https://chainid.network/chains.json" | \
  python3 -c "import json,sys; cs=[c for c in json.load(sys.stdin) if c['chainId']==20260619]; print(cs or 'NOT FOUND — safe to use')"
```

ถ้าผลลัพธ์คือ `NOT FOUND — safe to use` ก็ใช้ได้ ถ้าเจอ chain อื่นอยู่แล้ว ให้เพิ่ม suffix เช่น `202606190` หรือเลือก ID อื่น

---

### โครงสร้าง deploy-config.json

`op-deployer` อ่าน `deploy-config.json` ก่อน deploy L1 contracts ทุกครั้ง — fields ที่สำคัญมีดังนี้:

```json
{
  "l1ChainID": 11155111,
  "l2ChainID": 20260619,

  "l2BlockTime": 2,
  "l1BlockTime": 12,

  "maxSequencerDrift": 600,
  "sequencerWindowSize": 3600,
  "channelTimeout": 300,

  "p2pSequencerAddress": "<SEQUENCER_P2P_ADDR>",
  "batchSenderAddress":  "0x644Da211BB604B58666b8a9a2419E4F3F2aceC0A",
  "l2OutputOracleProposer": "<PROPOSER_ADDR>",

  "l2GenesisBlockGasLimit": "0x3938700",
  "eip1559Denominator": 50,
  "eip1559Elasticity": 6,

  "fundDevAccounts": false,
  "useFaultProofs": false
}
```

#### อธิบาย Fields สำคัญ

**`l1ChainID` / `l2ChainID`**
กำหนดคู่ L1–L2 ที่ contracts จะ hardcode ไว้ ผิดแล้วแก้ไม่ได้ — ต้อง redeploy ใหม่ทั้งหมด

**`l2BlockTime`**
OP Stack default = 2 วินาที ค่านี้จะถูก encode เข้า genesis และ rollup config ถ้าเปลี่ยนทีหลังต้อง hard fork

**`maxSequencerDrift`**
ระยะเวลา (วินาที) ที่ sequencer ผลิตบล็อกต่อได้โดยไม่ต้องรอ L1 block ใหม่ — ตั้งสูงเกินไปเปิดช่อง timestamp manipulation ตั้งต่ำเกินไป sequencer อาจ stall ถ้า L1 ช้า

**`sequencerWindowSize`**
จำนวน L1 block ที่ sequencer มีเวลาโพสต์ batch — เกินแล้วบล็อกจะถูก mark invalid

**`batchSenderAddress`**
address ที่ op-batcher ใช้เซ็น batch transaction บน L1 — ต้องมี ETH ใน Sepolia ก่อนรัน batcher มิฉะนั้น batcher จะโพสต์ไม่ได้และ follower จะค้างที่ block 0 (ดูบทที่ 5)

**`l2GenesisBlockGasLimit`**
`0x3938700` = 60,000,000 gas — chain นี้ใช้ค่านี้ ปกติ OP Mainnet ใช้ 30M แต่สำหรับ testnet/workshop ตั้งสูงกว่าได้

**`fundDevAccounts`**
ถ้า `true` จะ mint ETH ให้ dev accounts ที่รู้ private key กันทั่วไป (เช่น Hardhat accounts) — **ห้ามเปิดบน production chain** เด็ดขาด

---

### genesis alloc: bootstrap เศรษฐกิจให้ chain

deploy-config อย่างเดียวไม่พอ — ถ้า genesis alloc ไม่มี address ที่มี balance ผู้ใช้ใหม่จะมี 0 L2 ETH ทุกคน และทางเดียวที่จะได้ ETH คือ bridge จาก L1

chain ของ Oracle School เจอปัญหานี้จริง — ผู้ใช้ใหม่ต้อง bridge ผ่าน OptimismPortal เอง หรือขอจาก batcher wallet (ดู P12 และ P14-P15 ในบทที่ 5)

ถ้าจะ bootstrap ให้ user ตั้งแต่แรก ให้เพิ่ม alloc ใน `genesis-template.json`:

```json
{
  "alloc": {
    "0xYOUR_TEAM_ADDRESS": {
      "balance": "0xDE0B6B3A7640000"
    }
  }
}
```

`0xDE0B6B3A7640000` = 1 ETH ใน wei (hex) — เพิ่มได้หลาย address ก่อน `op-deployer genesis`

---

### Security Warnings

> **ห้าม commit `deploy-config.json` ที่มี private key หรือ mnemonic ลง git**
> op-deployer รับ key ผ่าน environment variable หรือ keystore ไม่ใช่ field ใน config

จุดที่ต้องระวังพิเศษ:

1. **`p2pSequencerAddress`** — เป็น address สาธารณะ แต่ private key ที่สอดคล้องกันต้องเก็บแยกต่างหาก (ดูบทที่ 4)
2. **`batchSenderAddress`** ต้องมี ETH บน L1 จริงๆ ก่อน deploy ถ้า fund ไม่พอ batcher จะ fail แบบงงมาก
3. **`l2ChainID`** ต้อง verify ก่อนทุกครั้ง — เปลี่ยนหลัง deploy ไม่ได้

---

### ตรวจสอบ Chain ID หลัง Deploy

หลัง op-deployer รัน genesis และ rollup config ถูก generate ให้ verify ทันที:

```bash
# ดู chain ID จาก genesis.json
cat genesis.json | python3 -c "import json,sys; g=json.load(sys.stdin); print('chainId:', int(g['config']['chainId']))"

# ดู chain ID จาก rollup.json
cat rollup.json | python3 -c "import json,sys; r=json.load(sys.stdin); print('l2ChainID:', r['chain_id'])"
```

ทั้งสองต้องแสดง `20260619` — ถ้าไม่ตรงกัน genesis กับ rollup config ไม่ match และ follower จะ handshake ไม่ผ่าน

---

### บทเรียนจากสนาม

Chain ID คือ identity ของ chain — เลือกหนึ่งครั้งแล้วเปลี่ยนไม่ได้โดยไม่ redeploy ทุกอย่าง ใช้วันที่ genesis เป็นฐาน verify ว่าว่างก่อนเสมอ และ lock ค่านี้ใน deploy-config ก่อนที่ใครในทีมจะเริ่มรัน node

deploy-config เป็นแค่จุดเริ่มต้น — บทถัดไปจะเข้าสู่การสร้าง wallet และ key management สำหรับ sequencer, batcher, และ proposer ซึ่งเป็นหัวใจของการรักษาความปลอดภัย chain

---

*Weizen Oracle (AI · Rule 6) — เขียนจาก deployment จริง Oracle School รุ่น 1*

---

## บทที่ 4 — op-deployer: deploy L1 contracts บน Sepolia

chain จะเกิดไม่ได้ถ้า L1 ยังไม่มีสัญญา พอ op-deployer apply เสร็จ ก็มี OptimismPortal รอรับ deposit, SystemConfig เก็บ config ไว้ให้ op-node อ่าน, และ batchInbox รออ้าแขนรับ batch จาก batcher — สามตัวนี้คือ "รากของ chain" บน Ethereum Sepolia ที่ทุกอย่างยึดโยงกัน

---

### ทำไมต้อง deploy ก่อนสร้าง genesis

op-node และ op-geth ต้องรู้ address ของ L1 contracts ก่อนสร้าง `genesis.json` เพราะ genesis embed `l1_system_config_address` และ `deposit_contract_address` (= OptimismPortal proxy) เข้าไปใน rollup config โดยตรง ถ้าสร้าง genesis ก่อน deploy สัญญา ตัวเลข address ก็ยังไม่มี — deploy ก่อนเสมอ

---

### เตรียม deployer wallet ให้มีเงินก่อน

op-deployer ใช้ private key เดียวกันทำทุกอย่าง: deploy factory, deploy proxy, set config ทั้ง SystemConfig ล้วนต้อง broadcast tx บน Sepolia จริง ค่า gas สูง

สำหรับ chain นี้ wallet ที่ทำหน้าที่ deployer/pool คือ `0x644Da211BB604B58666b8a9a2419E4F3F2aceC0A` ซึ่งอ.Nat fund มาให้ก่อนเริ่ม workshop

**ขั้นต่ำที่ควรมีก่อน deploy:**

| รายการ | ETH โดยประมาณ |
|--------|--------------|
| deploy L1 contracts ทั้งชุด (ผ่าน op-deployer) | ~0.05–0.1 ETH Sepolia |
| fund batcher account (รัน op-batcher ต่อเนื่อง) | 0.1–0.5 ETH Sepolia |
| fund proposer account (optional dev) | 0.05 ETH Sepolia |
| สำรอง gas (restart + re-tx) | 0.05 ETH |

Sepolia ETH หาได้จาก faucet หลายเจ้า (alchemy / infura / quicknode) — บางเจ้าต้องมี mainnet balance เล็กน้อย

---

### โครงสร้าง intent ที่ op-deployer ต้องการ

op-deployer ทำงานจาก "intent file" ที่ระบุว่าต้องการ deploy chain ใด บน L1 ใด ด้วย config อะไร รูปแบบคร่าวๆ:

```toml
# intent.toml (ตัวอย่างโครงสร้าง)
[global]
  workdir = "/path/to/deploy-artifacts"
  l1_rpc_url = "https://rpc.sepolia.dev"
  private_key = "0x<DEPLOYER_PRIVATE_KEY>"

[[chains]]
  id = 20260619
  base_chain_id = 11155111          # Sepolia

  [chains.roles]
    proposer   = "0x<PROPOSER_ADDR>"
    batcher    = "0x644Da211BB604B58666b8a9a2419E4F3F2aceC0A"
    sequencer  = "0x<SEQUENCER_ADDR>"

  [chains.deploy_config]
    l2_block_time        = 2
    gas_limit            = 60000000
    base_fee_scalar      = 1368
    blob_base_fee_scalar = 810949
```

> ห้ามใส่ private key ตรงๆ ในไฟล์ที่ commit เข้า git — ใช้ env var หรือ pass แทน

---

### รัน op-deployer apply

```bash
# ตั้ง env ก่อน (ไม่ hardcode key ในคำสั่ง)
export DEPLOYER_PK="$(pass show eth/chain-deployer)"

op-deployer apply \
  --workdir ./deploy-artifacts \
  --l1-rpc-url https://rpc.sepolia.dev \
  --private-key "$DEPLOYER_PK"
```

op-deployer จะ:
1. deploy `ProxyAdmin` + `AddressManager` factory บน L1
2. deploy proxy contracts ทั้งชุด (OptimismPortal, SystemConfig, L1CrossDomainMessenger, L1StandardBridge ฯลฯ)
3. initialize contract แต่ละตัวด้วย config จาก intent
4. เขียน `state.json` + `rollup.json` + `genesis.json` ลง `--workdir`

ระหว่างรัน จะเห็น tx hash ไหลออกมา ให้ดูที่ Sepolia Etherscan เพื่อ confirm แต่ละ batch

---

### address จริงที่ได้หลัง deploy

chain 20260619 ที่ Oracle School deploy จริงได้ address ดังนี้:

| Contract | Address (Proxy) |
|----------|----------------|
| OptimismPortal | `0x08d045e317f924a9428959ac557f198f95a7b519` |
| SystemConfig | `0x2ab35cd61aa475d6a2df296ebbf6b132c7587d86` |
| batchInbox | `0x00b183c4dd523784207fce23ebf838bcfa80c455` |

ตรวจสอบบน Sepolia Etherscan ว่า OptimismPortal proxy มี code จริง:

```bash
cast code 0x08d045e317f924a9428959ac557f198f95a7b519 \
  --rpc-url https://rpc.sepolia.dev | head -c 20
```

ถ้าได้ `0x608060...` (bytecode ขึ้นต้นด้วย EVM preamble) แสดงว่า deploy สำเร็จ ถ้าได้ `0x` คือ deploy ยังไม่จบหรือ tx fail

---

### ตรวจสอบ implementation ผ่าน EIP-1967

proxy contracts ใน OP Stack ทำตาม EIP-1967 — implementation address เก็บที่ storage slot คงที่:

```bash
# อ่าน impl address ของ OptimismPortal proxy
cast storage \
  0x08d045e317f924a9428959ac557f198f95a7b519 \
  0x360894a13ba1a3210667c828492db98dca3e2076 \
  --rpc-url https://rpc.sepolia.dev
```

ค่าที่ได้สำหรับ chain นี้ = `0x000...e89f13c5ee4033b2d3cd76c9d6958efbfe26d3c2` ซึ่งคือ OptimismPortal implementation version 5.6.1

> **กับดัก P13:** `state.json` ที่ op-deployer เขียนออกมามี field ชื่อ `OptimismPortalImpl` — ค่านั้นอาจเป็น `0x0` ได้ในบาง version ของ deployer แต่ไม่ได้แปลว่า proxy พัง field นั้นไม่ใช่ address ที่ op-node ใช้จริง op-node อ่านจาก `rollup.json` ซึ่งชี้ไปที่ proxy address ถ้าไม่แน่ใจ verify on-chain ด้วย `cast storage` อย่าเชื่อ field ใน state.json ตาบอด

---

### ตรวจสอบ SystemConfig

SystemConfig เก็บ batcherAddr, gasLimit, scalar ต่างๆ — op-node อ่านตัวนี้เพื่อรู้ว่าต้อง index batch จาก address ใด:

```bash
# ดู batcherAddr ที่ register ไว้ใน SystemConfig
cast call \
  0x2ab35cd61aa475d6a2df296ebbf6b132c7587d86 \
  "batcherHash()(bytes32)" \
  --rpc-url https://rpc.sepolia.dev
```

ค่าที่ได้ต้อง decode เป็น address `0x644Da211BB604B58666b8a9a2419E4F3F2aceC0A` ซึ่งคือ batcher wallet ที่ fund แล้ว

---

### ไฟล์ที่ได้จาก --workdir (นำไปใช้ต่อ)

หลัง apply เสร็จ ใน `./deploy-artifacts/` จะมี:

```
deploy-artifacts/
├── state.json          # snapshot ของ deploy (อ่าน impl addr ได้ แต่อย่าเชื่อทุก field)
├── rollup.json         # config ที่ op-node ต้องการ (genesis hash, portal addr, ฯลฯ)
└── genesis.json        # genesis state ของ L2 (ใช้กับ op-geth init)
```

สามไฟล์นี้คือ "พิมพ์เขียว" ของ chain ทำสำเนาเก็บไว้ก่อน เพราะบท 5-6 ต้องใช้ทุกตัว

> **กับดัก P6:** อย่าใช้ `rollup.json` ที่ publish ไว้บน HTTP server ถ้าไม่มั่นใจว่า sync กับ deploy ล่าสุด chain นี้เจอปัญหา genesis hash ขัดกัน 3 ทาง (`genesis.json` vs HTTP endpoint vs live block 0) เพราะ server ยังเสิร์ฟ rollup.json เก่าจากการ deploy รอบก่อน วิธีปลอดภัยที่สุดคือ copy ไฟล์จาก `--workdir` ของ deploy รอบล่าสุดโดยตรง

---

### บทเรียนของบทนี้

deploy L1 contracts คือขั้นตอนที่ "เปลี่ยนไม่ได้ง่ายๆ" เพราะ address ที่ได้จะถูก embed เข้า genesis และ rollup config ซึ่งต้องตรงกับ L1 จริงตลอดอายุ chain ถ้า deploy ผิดพลาดหรือ config ไม่ตรง ทางเดียวคือ redeploy ทั้งชุดและสร้าง genesis ใหม่ (ดังที่เกิดขึ้นจริง 3 รอบใน workshop) ดังนั้น verify on-chain ด้วย `cast` ก่อนเดินหน้าสร้าง genesis เสมอ

บทถัดไปจะนำ `genesis.json` และ `rollup.json` ไปสร้าง op-geth + op-node บน sequencer และ boot L2 ให้ผลิตบล็อกแรก

---

## บทที่ 5 — สร้าง genesis และ rollup.json

พอ deploy L1 contracts เสร็จ สิ่งที่ chain ต้องการต่อไปคือ "จุดเริ่มต้นของโลก" — genesis block ที่ทุกโหนดต้องเห็นตรงกันเป๊ะ และ rollup.json ที่บอก op-node ว่าสร้าง L2 จาก L1 ยังไง ถ้าสองอย่างนี้คลาดกันแม้แต่ byte เดียว โหนดจะ derive ไม่ตรงกัน chain แตก

### สร้าง genesis.json และ rollup.json ด้วย op-node

`op-node` มี subcommand `genesis l2` ไว้สร้างไฟล์สองตัวนี้จาก deploy config และ L1 deployment artifacts

```bash
op-node genesis l2 \
  --deploy-config ./deploy-config.json \
  --l1-deployments ./deployments/state.json \
  --outfile.l2 ./genesis.json \
  --outfile.rollup ./rollup.json \
  --l1-rpc https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
```

คำสั่งนี้จะอ่าน L1 block ที่ระบุใน deploy-config (ผ่าน `--l1-rpc`) แล้วบันทึก anchor L1 block ลงใน rollup.json พร้อมสร้าง genesis state ทั้งหมดที่ฝัง predeploy contracts ของ OP Stack ไว้ใน genesis alloc

สำหรับ chain 20260619 ผลลัพธ์ที่ได้:

- genesis hash: `0x1c9445c6cac6880fae00b45dedfc8bf43ce5fd39ec8eb9053b02e2e89a09ff23`
- anchor L1 block: `11098766` (hash `0xdaf23148...`)
- l2_time: `1781926452`

### โครงสร้าง rollup.json ที่สำคัญ

rollup.json คือ "passport" ของ chain — op-node ทุกตัว (sequencer + follower) ต้องใช้ไฟล์นี้ตัวเดียวกัน fields ที่ต้องตรวจให้ถูก:

```json
{
  "genesis": {
    "l1": {
      "hash": "0xdaf23148...",
      "number": 11098766
    },
    "l2": {
      "hash": "0x1c9445c6cac6880fae00b45dedfc8bf43ce5fd39ec8eb9053b02e2e89a09ff23",
      "number": 0
    },
    "l2_time": 1781926452,
    "system_config": { ... }
  },
  "block_time": 2,
  "max_sequencer_drift": 600,
  "seq_window_size": 3600,
  "channel_timeout": 300,
  "l1_chain_id": 11155111,
  "l2_chain_id": 20260619,
  "batch_inbox_address": "0x00b183c4dd523784207fce23ebf838bcfa80c455",
  "deposit_contract_address": "0x08d045e317f924a9428959ac557f198f95a7b519",
  "l1_system_config_address": "0x2ab35cd61aa475d6a2df296ebbf6b132c7587d86",
  ...
}
```

#### fields สำคัญที่ follower ต้องตรวจ

| field | ความหมาย | ของ chain 20260619 |
|---|---|---|
| `genesis.l2.hash` | genesis hash ที่ต้องตรง | `0x1c9445c6...` |
| `genesis.l2_time` | timestamp ของ genesis block | `1781926452` |
| `batch_inbox_address` | op-batcher โพสต์ batch ที่นี่ | `0x00b183c4...` |
| `deposit_contract_address` | OptimismPortal proxy (L1) | `0x08d045e3...` |
| `l1_system_config_address` | SystemConfig proxy (L1) | `0x2ab35cd6...` |
| `l2_chain_id` | chainId ของ L2 | `20260619` |

`deposit_contract_address` สำคัญมาก — op-node ใช้ address นี้ filter L1 events เพื่อ derive deposit transactions ลง L2 ถ้าใส่ผิดจะไม่เห็น deposit เลย

### วิธีตรวจ genesis hash ให้ตรง

พอสร้าง genesis.json แล้ว ขั้นตอนบังคับคือ init op-geth และตรวจ hash:

```bash
op-geth init --datadir ./datadir genesis.json
```

op-geth จะพิมพ์ hash ออกมา:

```
INFO Successfully wrote genesis state  database=lightchaindata hash=0x1c9445c6...
```

hash ที่ได้ต้องตรงกับ `genesis.l2.hash` ใน rollup.json ทุก byte ถ้าไม่ตรง หมายความว่า genesis.json และ rollup.json สร้างคนละชุดกัน หรือมีใครแก้ fields ทีหลัง

#### สาเหตุที่ hash ไม่ตรงบ่อยๆ

เรียง ordering ของ fields ใน genesis alloc, extraData ที่ไม่ถูก format, หรือ timestamp ใน genesis.json ที่ไม่ตรงกับ rollup.json ล้วนเปลี่ยน hash ได้ทั้งนั้น genesis.json ต้องมาจากคำสั่งเดียวกับ rollup.json ไม่ใช่ generate แยก

### ระวัง: timestamp และ clock-wedge

`l2_time` ใน genesis คือ Unix timestamp (วินาที) ของ genesis block L2 ค่านี้ต้องสอดคล้องกับ L1 anchor block เวลาจริง

สำหรับ chain 20260619 timestamp `1781926452` ตรงกับวันที่ 2026-06-19 ในเวลา UTC — ถ้าตั้งผิดออกไปหลายชั่วโมงหรือหลายวัน sequencer จะ produce บล็อกแรก (deposit-only block) ที่มี timestamp ไม่ valid ตาม consensus rules แล้ว op-node ฆ่าตัวเองทิ้ง crash-loop จนกว่าจะ redeploy ใหม่

ปัญหานี้เกิดจริงในวัน deploy ของ chain 20260619 (clock-wedge P5) — รายละเอียดการ diagnose และแก้จะอยู่ในบทที่ 8

### genesis alloc และปัญหา empty economy

genesis.json มี `alloc` section ที่กำหนด initial state ของ addresses ทั้งหมดใน L2 ตั้งแต่วินาทีแรก OP Stack predeploys (WETH9, L2CrossDomainMessenger, L2StandardBridge ฯลฯ) จะถูกใส่ไว้ให้อัตโนมัติ

แต่ **user account ไม่มี balance** ถ้าไม่ได้ตั้งไว้ใน alloc ตั้งแต่แรก

```json
"alloc": {
  "0xYourAddress": {
    "balance": "0x56BC75E2D630FFFFF"
  },
  ...predeploys...
}
```

พอ chain ออกไปแล้ว จะเพิ่ม alloc ไม่ได้อีก ทางเดียวที่ user ใหม่จะมี L2 ETH คือ bridge ผ่าน OptimismPortal หรือโอนจาก address ที่มีอยู่แล้ว ใน chain 20260619 genesis alloc ไม่มี user account — ทำให้วัน deploy ต้องรอ bridge L1->L2 ก่อนใครจะส่ง tx ได้ (ปัญหา P12 ที่ Orz ยกขึ้น)

สำหรับ chain ใหม่ควรพิจารณาใส่ faucet address ไว้ใน alloc ตั้งแต่แรกหรือเตรียม bridge workflow ให้พร้อม ก่อน sequencer จะ announce

### ไฟล์ที่ต้อง distribute ให้ทุกโหนด

| ไฟล์ | ใช้กับ | โหนดที่ต้องการ |
|---|---|---|
| `genesis.json` | `op-geth init` | sequencer + follower ทุกตัว |
| `rollup.json` | `op-node --rollup.config` | op-node ทุกตัว |

สองไฟล์นี้ต้องมาจาก genesis generation รอบเดียวกัน ไม่ใช่ generate ซ้ำในภายหลัง เพราะ determinism ขึ้นกับ L1 block state ณ เวลาที่ generate

> ใน chain 20260619 พบปัญหา genesis ไม่ตรง 3 ทาง (P6): genesis.json ที่ serve ผ่าน HTTP, rollup.json เวอร์ชัน publish เก่า (`genesis hash 0xe365a0cf`), และ block 0 จริงบน chain (`0x1c9445c6`) ขัดกันทั้งหมด แก้โดยใช้ `~/op-stack/rollup.json` บน sequencer server โดยตรง ไม่ใช่ไฟล์ที่ publish ไว้ล่วงหน้า

### ตรวจ rollup.json ของ sequencer โดยตรง

ถ้าไม่แน่ใจว่า rollup.json ที่มีถูกต้องไหม สามารถ query op-node โดยตรง:

```bash
curl -s http://<SEQUENCER_HOST>:9547 \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"optimism_rollupConfig","params":[],"id":1}' \
  | jq '.result.genesis.l2.hash'
```

ถ้าได้ `"0x1c9445c6cac6880fae00b45dedfc8bf43ce5fd39ec8eb9053b02e2e89a09ff23"` แสดงว่า rollup.json ที่ sequencer ใช้ถูกต้อง ให้ copy ไฟล์นั้นมาใช้แทนการ generate ใหม่

### บทเรียนจากบทนี้

genesis hash เป็น fingerprint ของทั้ง chain — timestamp ผิดนิดเดียว alloc ต่างกัน หรือ rollup.json คนละ generation ก็ทำให้ hash คลาดได้ ตรวจ hash ก่อน distribute เสมอ

genesis alloc คือโอกาสเดียวที่จะ bootstrap เศรษฐกิจ L2 ก่อน chain ออก — วางแผน faucet/bridge ไว้ล่วงหน้า ไม่ใช่รีบออก chain แล้วค่อยแก้ทีหลัง

**บทถัดไป (บทที่ 6)** จะเริ่มรัน sequencer จริง: op-geth init, op-node, และตรวจว่า block 1 ออกมาแล้ว — จุดเริ่มต้นของ chain ที่มีชีวิต

---

## บทที่ 6 — รัน sequencer: op-geth + op-node + op-batcher

chain ผลิต genesis block ได้แล้ว แต่ยังไม่มีใครผลิตบล็อกถัดไป สามไบนารีต้องรันพร้อมกัน — ขาดตัวใดตัวหนึ่งก็ระบบหยุด follower ค้าง และ batcher ไม่ส่ง batch ลง L1

### สถาปัตยกรรม sequencer โดยย่อ

```
op-node  <--Engine API (JWT/8551)--> op-geth
   |
   +-- L1 derivation (อ่าน batch จาก batchInbox บน Sepolia)
   +-- P2P libp2p gossip (ส่ง unsafe block ให้ follower)

op-batcher --> L1 batchInbox (0x00b183c4dd523784207fce23ebf838bcfa80c455)
```

op-geth เก็บ state EVM และรัน Engine API ที่ port **8551** — op-node เป็นคนส่ง block payload ผ่าน `engine_newPayload` / `engine_forkchoiceUpdated` ไม่ใช่ devp2p

### JWT secret — กุญแจล็อก Engine API

Engine API ที่ port 8551 ต้องการ JWT token เพื่อยืนยันว่า op-node ที่คุยด้วยเป็นตัวจริง ไม่ใช่ client อื่น

```bash
# สร้าง JWT secret (ทำครั้งเดียว)
openssl rand -hex 32 > ~/op-stack/jwt.hex
chmod 600 ~/op-stack/jwt.hex
```

op-geth และ op-node ต้องอ่านไฟล์เดียวกัน ถ้าคนละไฟล์หรือ hex ไม่ตรงกัน Engine API จะ reject ทุก request และ op-node จะ error `unauthorized`

### รัน op-geth

```bash
op-geth \
  --datadir ~/op-stack/datadir \
  --http \
  --http.addr 0.0.0.0 \
  --http.port 8545 \
  --http.api eth,net,web3,debug \
  --authrpc.addr 0.0.0.0 \
  --authrpc.port 8551 \
  --authrpc.jwtsecret ~/op-stack/jwt.hex \
  --authrpc.vhosts "*" \
  --networkid 20260619 \
  --syncmode full \
  --gcmode archive \
  --nodiscover \
  --maxpeers 0 \
  --port 30303 \
  2>&1 | tee ~/op-stack/logs/op-geth.log
```

#### flag ที่สำคัญ

| flag | ค่า | เหตุผล |
|------|-----|--------|
| `--authrpc.port` | 8551 | Engine API — op-node ต้องตรงกันเป๊ะ |
| `--authrpc.jwtsecret` | jwt.hex | ยืนยัน identity ระหว่าง op-geth กับ op-node |
| `--http.port` | 8545 | JSON-RPC สำหรับ user/dApp |
| `--syncmode full` | — | sequencer ต้อง full; ถ้า follower ใช้ snap ได้ |
| `--gcmode archive` | — | เก็บ state ทุก block (ต้องการสำหรับ proof) |
| `--nodiscover` | — | sequencer ไม่ต้องการ devp2p discovery |

> **หมายเหตุ port ชน (P7):** พอ restart op-geth ใหม่แล้ว process เก่าถือ :30303 / :8545 / :8551 ค้างอยู่ ตัวใหม่จะ Exit 1 "address already in use" ทันที แก้ด้วย:
> ```bash
> pkill -9 -x op-geth
> fuser -k 8545/tcp 8551/tcp 30303/tcp
> ```

### รัน op-node (sequencer mode)

```bash
op-node \
  --l1 https://sepolia.infura.io/v3/<YOUR_KEY> \
  --l1.beacon https://beacon-sepolia.example.com \
  --l2 http://localhost:8551 \
  --l2.jwt-secret ~/op-stack/jwt.hex \
  --rollup.config ~/op-stack/rollup.json \
  --rpc.addr 0.0.0.0 \
  --rpc.port 9547 \
  --sequencer.enabled \
  --sequencer.l1-confs 4 \
  --p2p.sequencer.key <SEQUENCER_PRIVATE_KEY_HEX> \
  --p2p.listen.ip 0.0.0.0 \
  --p2p.listen.tcp 9222 \
  --p2p.listen.udp 9222 \
  2>&1 | tee ~/op-stack/logs/op-node.log
```

#### flag สำคัญของ op-node

| flag | หน้าที่ |
|------|---------|
| `--l2` | Engine API URL ของ op-geth — ต้องใช้ port 8551 พร้อม JWT |
| `--rollup.config` | rollup.json ที่ได้จาก op-deployer (ต้องตรงกับ genesis จริง) |
| `--sequencer.enabled` | เปิด sequencer mode — สร้างบล็อกใหม่ทุก ~2 วินาที |
| `--p2p.sequencer.key` | private key เซ็น P2P gossip block — **ขาดตัวนี้ follower ไม่ได้ unsafe block** |
| `--rpc.port` | 9547 — RPC ของ op-node (ใช้ `optimism_syncStatus`) |

> **P2P sequencer key (P10):** ถ้าไม่ใส่ `--p2p.sequencer.key` op-node จะผลิตบล็อกได้ปกติ แต่ไม่เซ็น P2P gossip message → follower ที่รับ gossip จะ reject block ทุกตัว → follower sync ได้แต่ผ่าน L1 derivation เท่านั้น ซึ่งช้ากว่า safe_l2 delay หลายนาที DustBoy/B3 เป็นคน diagnose ปัญหานี้จากสนามจริง Nova แก้โดยเพิ่ม flag แล้ว restart

### รัน op-batcher

op-batcher คือตัวที่นำ L2 tx มาจัดเป็น batch แล้วส่งลง L1 batchInbox ทุกๆ ไม่กี่บล็อก ถ้าไม่รัน batcher follower จะ derive ไม่ได้เลย — safe_l2 จะค้างที่ block 0 ตลอด

```bash
op-batcher \
  --l1-eth-rpc https://sepolia.infura.io/v3/<YOUR_KEY> \
  --l2-eth-rpc http://localhost:8545 \
  --rollup-rpc http://localhost:9547 \
  --private-key <BATCHER_PRIVATE_KEY_HEX> \
  --batch-type 1 \
  --target-l1-tx-size-bytes 120000 \
  --num-confirmations 4 \
  2>&1 | tee ~/op-stack/logs/op-batcher.log
```

batcherAddr ที่ใช้ใน chain นี้คือ `0x644Da211BB604B58666b8a9a2419E4F3F2aceC0A` ซึ่งเป็น wallet เดียวกับ pool/deployer อ.Nat fund 2 ETH ลง Sepolia ให้ก่อน batcher ถึงจะโพสต์ batch ได้

> **Batcher หยุดหลัง batch แรก (P4):** op-batcher version บางตัวส่ง batch แรกแล้วหยุด ("Batch Submitter stopped") โดยไม่ crash ต้อง restart + เปิด keep-alive ด้วย screen/nohup/systemd ที่ production ควรใช้ systemd unit หรืออย่างน้อย `nohup ... &` ใน screen session

#### ตรวจสอบ batcher ทำงาน

```bash
# ดู safe_l2 ไต่ขึ้นไหม — ถ้าไต่ = batcher ทำงาน
curl -s http://<SEQUENCER_HOST>:9547 \
  -X POST -H "Content-Type: application/json" \
  -d '{"method":"optimism_syncStatus","params":[],"id":1,"jsonrpc":"2.0"}' \
  | jq '.result.safe_l2.number'
```

พอ batcher รันแล้ว `safe_l2.number` จะเริ่มไต่จาก 0 ขึ้นไป ถ้าค้างที่ 0 นาน 5 นาทีให้ดู log batcher ว่ามี error หรือ ETH หมด

### สรุป port ทั้งหมด

| process | port | protocol | หน้าที่ |
|---------|------|----------|---------|
| op-geth | 8545 | HTTP JSON-RPC | user / dApp / batcher |
| op-geth | 8551 | Engine API (JWT) | op-node เท่านั้น |
| op-geth | 30303 | devp2p TCP/UDP | EL peer (ถ้ารัน EL sync) |
| op-node | 9547 | HTTP JSON-RPC | `optimism_syncStatus` / admin |
| op-node | 9222 | libp2p TCP/UDP | P2P gossip กับ follower |

endpoint สาธารณะของ chain นี้ (sequencer): `http://<SEQUENCER_HOST>:9545` (op-geth) และ `http://<SEQUENCER_HOST>:9547` (op-node)

### บทเรียนจากสนามจริง

สามไบนารีนี้ต้องพึ่งพากันเป็นลูกโซ่ — op-geth ต้องรันก่อน op-node ถึงจะ connect Engine API ได้ op-batcher ต้องรันหลังจาก op-node ขึ้น safe เพื่อมี block ให้ batch ขาดตัวใดตัวหนึ่งไม่ใช่แค่ feature หาย แต่ sync ทั้งระบบหยุด

JWT secret เป็นกุญแจที่มองไม่เห็นแต่สำคัญที่สุด ถ้า jwt.hex ของ op-geth กับ op-node ไม่ตรงกัน Engine API จะ reject เงียบๆ และ op-node จะ error ไม่ชัดเจน ให้ตรวจ hex ก่อนเป็นอันดับแรกเมื่อ op-node ต่อ op-geth ไม่ติด

บทถัดไปจะพาตั้ง follower node — รับ unsafe block จาก P2P gossip และ sync ผ่าน L1 derivation พร้อมกัน และอธิบายว่าทำไม two-path sync ถึงสำคัญกว่าที่คิด

---

## บทที่ 7 — ปัญหาใหญ่ #1: chain ค้างที่ block 0

follower node รันอยู่ peer เชื่อมได้ op-node ทำงาน แต่พอถาม block number — ตอบ 0 เสมอ ไม่ว่าจะรอนานแค่ไหนก็ตาม เรื่องนี้เกิดกับทุกคนที่ deploy L2 ครั้งแรก และมีเหตุผลที่ชัดเจนมาก

---

### อาการ

follower node เริ่มต้นแล้วค้างที่ block 0 ตลอด:

```bash
# ถาม current block ของ follower
curl -s http://localhost:9545 \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq .result
# ได้: "0x0"  <-- ค้างที่ 0 ไม่ขยับ
```

ดู sync status ของ op-node:

```bash
curl -s http://localhost:9547 \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"optimism_syncStatus","id":1}' | jq '{
    unsafe_l2: .unsafe_l2.number,
    safe_l2:   .safe_l2.number,
    finalized_l2: .finalized_l2.number
  }'
```

ถ้าผลออกมาแบบนี้ — นี่คืออาการที่ว่า:

```json
{
  "unsafe_l2": 0,
  "safe_l2": 0,
  "finalized_l2": 0
}
```

`safe_l2` ไม่ขยับ = L1 derivation ไม่ทำงาน `unsafe_l2` ไม่ขยับ = P2P gossip ก็ไม่มาด้วย

---

### root cause: ไม่มี op-batcher

OP Stack L2 มี 2 เส้นทางในการ sync:

| เส้นทาง | ทำงานอย่างไร | บล็อกที่ได้ |
|---------|-------------|-------------|
| **L1 derivation** | op-node อ่าน batch จาก L1 batchInbox | "safe" blocks |
| **P2P gossip** | op-node รับบล็อกจาก sequencer โดยตรง | "unsafe" blocks |

follower ต้องใช้ทั้งสองเส้นทางพร้อมกัน — P2P ให้บล็อกใหม่แบบ real-time แต่เติม gap จาก block 0 ถึง head ไม่ได้ L1 derivation เป็นตัวเติมประวัติ

พอไม่มี op-batcher รัน — ไม่มีใครโพสต์ L2 transaction batch ลง L1 batchInbox:

```
batchInbox = 0x00b183c4dd523784207fce23ebf838bcfa80c455  (บน Sepolia)
```

op-node ของ follower ไปอ่าน batchInbox บน L1 แต่ไม่เจอ batch เลยก็ไม่มีอะไรจะ derive ค้างอยู่ที่ genesis

sequencer เองไม่ค้างเพราะ sequencer คือตัวที่ผลิตบล็อก — มันไม่ต้อง derive จาก L1 follower เท่านั้นที่พึ่ง derivation

---

### วิธี diagnose ที่ถูก

ก่อนโทษ config ใดๆ ให้เช็ค `safe_l2` ก่อนเสมอ:

```bash
# เรียกซ้ำ 2-3 ครั้ง ห่างกัน ~30 วินาที
curl -s http://<SEQUENCER_HOST>:9547 \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"optimism_syncStatus","id":1}' \
  | jq '.safe_l2.number'
```

ถ้า `safe_l2` เป็น 0 ตลอดทั้งที่ chain รันมาแล้วหลายนาที — ปัญหาอยู่ที่ L1 derivation ไม่ใช่ config ของ follower

เช็คว่า batchInbox มี transaction ไหม:

```bash
# ดู tx ล่าสุดที่ batchInbox ได้รับบน Sepolia
cast block latest --rpc-url https://rpc.sepolia.org | grep number
# แล้วไปดูที่ Etherscan: https://sepolia.etherscan.io/address/0x00b183c4dd523784207fce23ebf838bcfa80c455
```

ถ้า batchInbox ว่างเปล่า — ยืนยันแล้วว่าปัญหาคือ op-batcher ไม่รัน

---

### วิธีแก้: fund + รัน op-batcher

op-batcher ต้องการ ETH บน L1 (Sepolia) สำหรับ gas ในการส่ง batch transaction ถ้า wallet batcher ไม่มี ETH — บัตเชอร์จะ error หรือหยุดเงียบ

#### ขั้นตอนที่ 1: fund batcher wallet

batcher address ของ chain นี้:

```
0x644Da211BB604B58666b8a9a2419E4F3F2aceC0A
```

ต้องมี Sepolia ETH พอสำหรับ gas ในช่วง dev อย่างน้อย 0.1 ETH ขึ้นไป อ.Nat fund 2 ETH ให้ในวัน deploy จริง

#### ขั้นตอนที่ 2: รัน op-batcher

```bash
./op-batcher \
  --l2-eth-rpc http://<SEQUENCER_HOST>:9545 \
  --rollup-rpc http://<SEQUENCER_HOST>:9547 \
  --poll-interval 1s \
  --sub-safety-margin 6 \
  --num-confirmations 1 \
  --safe-abort-nonce-too-low-count 3 \
  --resubmission-timeout 30s \
  --rpc.addr 0.0.0.0 \
  --rpc.port 8548 \
  --rpc.enable-admin \
  --max-channel-duration 1 \
  --l1-eth-rpc https://rpc.sepolia.org \
  --private-key <BATCHER_PRIVATE_KEY>
```

หลัง op-batcher รัน จะเห็น log แบบนี้:

```
INFO  Opened channel    id=... frames=1
INFO  Submitted batch   tx=0x...
```

#### ขั้นตอนที่ 3: verify ว่า safe_l2 ไต่ขึ้น

```bash
# รอ ~1 นาที แล้วเช็ค
curl -s http://<SEQUENCER_HOST>:9547 \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"optimism_syncStatus","id":1}' \
  | jq '{safe_l2: .safe_l2.number, unsafe_l2: .unsafe_l2.number}'
```

พอ safe_l2 ไต่ขึ้น — L1 derivation ทำงานแล้ว follower จะ sync ตาม

---

### โยง P9: P2P peer ติด ≠ full sync

อีกความเข้าใจผิดที่เกิดคู่กัน: ติด P2P peer กับ sequencer แล้วคิดว่า follower จะ sync ขึ้นมาได้

```
P2P gossip ส่งแค่บล็อกใหม่ — เติม gap จาก 0 ถึง head ไม่ได้
```

ถึงแม้ op-node จะ connect กับ sequencer ผ่าน libp2p multiaddr แล้ว (`/ip4/.../p2p/16Uiu2HAm...`) แต่ gossip ให้แค่บล็อกที่เพิ่งผลิตใหม่ ประวัติจาก block 0 จนถึง head ต้องมาจาก L1 derivation เท่านั้น

ดังนั้นถ้า safe_l2 = 0 และ unsafe_l2 ขยับแล้ว — แปลว่า P2P ทำงานแต่ L1 derivation ยังไม่มี batch

---

### บทเรียน

**แยก unsafe vs safe ก่อนโทษ config** — `optimism_syncStatus` บอกทันทีว่าปัญหาอยู่ที่ P2P หรือ L1 derivation ไม่ต้องเดา

**L1 derivation ต้องการ batcher** — follower ไม่มีทางขยับ safe_l2 ได้เลยถ้า batchInbox บน L1 ว่างเปล่า รัน op-batcher และ fund wallet ก่อนเปิดให้ follower ใดๆ เข้ามา sync

**P2P peer และ L1 derivation ทำงานคู่กัน** — ทั้งสองเส้นทางต้องรันพร้อมกัน P2P ให้ความเร็ว L1 derivation ให้ความถูกต้อง ขาดอันใดอันหนึ่งก็ sync ไม่สมบูรณ์

---

บทถัดไปจะเจาะ P2P ให้ลึกกว่านี้ — โดยเฉพาะปัญหาที่ sequencer ไม่เซ็น gossip block เพราะขาด `--p2p.sequencer.key` และทำไม follower ถึง connect ได้แต่ไม่เห็นบล็อกใหม่เลย

---

## บทที่ 8 — ปัญหาใหญ่ #2: clock-wedge และ genesis ไม่ตรง

พอ sequencer เดินหน้าได้แล้ว follower ก็ยังไม่ sync ได้ — ปัญหาครั้งนี้ไม่ใช่แค่ "batcher ไม่รัน" แต่มาจากต้นทางที่ลึกกว่า: **genesis timestamp เพี้ยน** และ **rollup config สามชุดขัดกันเอง** สองเรื่องนี้เชื่อมกันและฆ่า op-node เงียบๆ ในวงวน crash-loop ก่อนที่ใครจะทันรู้ตัว

---

### P5 — Clock-Wedge: เมื่อ genesis เกิดผิดเวลา

#### อาการ

sequencer boot ขึ้นมาได้ไม่กี่วินาที แล้ว op-node ก็ตาย ดู log:

```
WARN [op-node] Sequencer failed to build block  err="block time mismatch: ..."
CRIT [op-node] Sequencer encountered fatal error  err="..."
```

ไม่มี panic ชัดเจน — op-node ฆ่าตัวเองเงียบๆ แล้ว process manager ก็ restart ใหม่ loop ไม่รู้จบ

#### สาเหตุ

genesis.json ที่ใช้ deploy มี `timestamp` ผิด: ค่าที่ได้คือ `0x6a35cd34` แทนที่จะเป็น `0x6a360a34` — เพี้ยนกันประมาณ **9 วัน** (ค่า hex ต่างกัน ~777,600 วินาที)

OP Stack กำหนดว่าบล็อก L2 แต่ละบล็อกต้องมี timestamp ห่างจาก genesis อย่างน้อย `block_time` วินาที (ค่าปกติ 2 วินาที) และต้องไม่เกิน "เวลาปัจจุบัน + drift ที่ยอมรับได้" พอ genesis timestamp ไกลเกินไปในอดีต บล็อก deposit-only บล็อกแรก (บล็อก 1) จะมีเวลาที่ op-node คำนวณได้ไม่ตรงกับ anchor L1 block — validation fail ทันที

op-node version ใหม่เลือกที่จะ terminate แทนที่จะ skip เพราะถ้ายอมให้ block ไม่ valid ผ่านได้ chain ก็จะ diverge จาก canonical อย่างถาวร

#### Diagnose

DustBoy/PhD กับ B3 แกะ log ออกมาแล้วชี้ไปที่ genesis timestamp field โดยตรง วิธีเช็คเร็ว:

```bash
# ดู timestamp ใน genesis.json ที่ใช้ deploy
cat ~/op-stack/genesis.json | python3 -c "
import json, sys, datetime
g = json.load(sys.stdin)
ts = int(g['timestamp'], 16)
print('timestamp hex:', g['timestamp'])
print('timestamp dec:', ts)
print('datetime UTC:', datetime.datetime.utcfromtimestamp(ts))
"
```

ถ้า datetime ออกมาไม่ใกล้เคียงวันที่ตั้งใจ deploy — นั่นคือ root cause

เทียบกับ anchor L1 block ที่ควรจะเป็น:

```bash
# anchor L1 block ของ chain นี้ = block 11098766
cast block 11098766 --rpc-url https://rpc.sepolia.org | grep timestamp
```

genesis `l2_time` ต้องตรงกับ (หรือหลังจาก) timestamp ของ anchor L1 block

#### แก้

Nova redeploy ใหม่ด้วย genesis timestamp ที่ถูก ต้อง `op-deployer apply` ใหม่ทั้งหมด — ไม่มี patch genesis หลัง deploy แล้ว เพราะ genesis hash ฝังอยู่ใน rollup.json และ op-node ทุกตัวในเครือข่ายต้อง agree กัน

genesis ที่ถูกต้องของ chain 20260619:

| field | ค่าจริง |
|---|---|
| `timestamp` | `0x6a360a34` (= Unix 1781926452) |
| `l2_time` | 1781926452 |
| anchor L1 block | 11098766 |
| L2 genesis hash | `0x1c9445c6cac6880fae00b45dedfc8bf43ce5fd39ec8eb9053b02e2e89a09ff23` |

หลัง redeploy ด้วย timestamp ถูก op-node ก็หยุด crash-loop และ sequencer ผลิตบล็อกได้ตามปกติ

---

### P6 — Genesis 3-Way Mismatch: rollup.json ไหนคือของจริง

#### อาการ

follower boot ขึ้นมาแล้ว op-node ขึ้นแต่ไม่ sync — `optimism_syncStatus` แสดง `unsafe_l2` ค้างที่บล็อก 0 ทั้งที่ batcher รันแล้ว safe_l2 ก็ไม่ขยับ

Weizen ไปดึง rollup.json จาก server แล้วพบว่า genesis hash ที่ได้คือ `0xe365a0cf...` — ไม่ตรงกับ genesis hash จริงที่ได้จาก op-geth RPC ซึ่งอยู่ที่ `0x1c9445c6...`

#### สาเหตุ

มี rollup.json สามชุดที่ขัดกัน:

| แหล่ง | genesis hash | สถานะ |
|---|---|---|
| `http://<SEQUENCER_HOST>:8181/genesis.json` | (genesis.json ดิบ, ไม่มี hash) | เก่า/stale |
| `http://<SEQUENCER_HOST>:8181/rollup.json` | `0xe365a0cf...` | **stale** (จาก deploy รอบก่อน) |
| `~/op-stack/rollup.json` บน server | `0x1c9445c6...` | **ถูก** (จาก redeploy ล่าสุด) |

server เปิด `:8181` ให้ดาวน์โหลด config แต่ไฟล์ที่ serve ออกมาไม่ได้ update ตาม redeploy ล่าสุด — ยังเป็น artifact จาก deploy รอบที่ clock-wedge พัง

follower ที่ใช้ rollup.json จาก `:8181` จะ initialize op-node ด้วย genesis hash ผิด พอ op-node พยายาม match กับ L1 derivation ก็ fail เงียบๆ ไม่ sync

#### Diagnose

เช็ค genesis hash จากหลายแหล่งแล้วเปรียบเทียบ:

```bash
# 1. hash จาก rollup.json ที่มีอยู่
cat ~/rollup.json | python3 -c "
import json, sys
r = json.load(sys.stdin)
print('genesis l2 hash:', r['genesis']['l2']['hash'])
print('genesis l1 hash:', r['genesis']['l1']['hash'])
"

# 2. hash จาก live chain (block 0 บน sequencer)
cast block 0 --rpc-url http://<SEQUENCER_HOST>:9545 | grep hash

# 3. genesis hash ของจริงที่รู้แล้ว
# 0x1c9445c6cac6880fae00b45dedfc8bf43ce5fd39ec8eb9053b02e2e89a09ff23
```

ถ้า (1) ไม่ตรงกับ (2) — ต้องไปขอ rollup.json ชุดใหม่จาก sequencer โดยตรง

#### แก้

อย่าใช้ rollup.json จาก endpoint สาธารณะที่ไม่รู้ว่า update ล่าสุดเมื่อไร ให้ขอจากผู้ run sequencer โดยตรง หรือดึงจากเครื่อง server ผ่าน scp:

```bash
# วิธีที่ 1: scp โดยตรงจากเครื่อง sequencer (ถ้ามี SSH access)
scp user@<SEQUENCER_HOST>:~/op-stack/rollup.json ./rollup.json

# วิธีที่ 2: verify ก่อนใช้เสมอ
LIVE_HASH=$(cast block 0 --rpc-url http://<SEQUENCER_HOST>:9545 | grep "^hash" | awk '{print $2}')
LOCAL_HASH=$(cat rollup.json | python3 -c "import json,sys; print(json.load(sys.stdin)['genesis']['l2']['hash'])")
echo "live  : $LIVE_HASH"
echo "local : $LOCAL_HASH"
[ "$LIVE_HASH" = "$LOCAL_HASH" ] && echo "OK" || echo "MISMATCH — ใช้ rollup.json นี้ไม่ได้"
```

สำหรับ chain 20260619 ค่าที่ถูกใน rollup.json:

```json
{
  "genesis": {
    "l2": {
      "hash": "0x1c9445c6cac6880fae00b45dedfc8bf43ce5fd39ec8eb9053b02e2e89a09ff23",
      "number": 0
    },
    "l1": {
      "hash": "0xdaf23148...",
      "number": 11098766
    },
    "l2_time": 1781926452
  },
  "chain_id": 20260619
}
```

---

### ทั้งสองปัญหาเชื่อมกัน

clock-wedge (P5) บังคับให้ต้อง redeploy แต่ server endpoint ยังเสิร์ฟ artifact ของ deploy รอบเก่า (P6) follower ที่ download rollup.json จาก `:8181` จึงได้ config ผิดโดยอัตโนมัติ — สองปัญหานี้เสริมกันทำให้ทุกคนที่พยายาม boot follower ได้ config ที่ไม่ consistent กัน diagnose ยากขึ้นเพราะต้องเช็คทั้งสองชั้น

---

### บทเรียน

**timestamp ใน genesis.json ต้องตรวจก่อน deploy ทุกครั้ง** — ค่า hex เล็กน้อย 1 ตัว ทำให้ chain reboot ไม่จบ วิธีที่ปลอดภัยที่สุดคือใช้ Unix timestamp ของ L1 anchor block โดยตรง แล้ว verify ด้วย datetime() ก่อน commit genesis

**rollup.json ต้อง match live chain ตลอดเวลา** — อย่าเชื่อ endpoint สาธารณะที่ไม่ atomic กับ deploy ล่าสุด ทุกครั้งที่ redeploy ต้อง distribute rollup.json ใหม่พร้อมกัน และ follower ต้อง verify genesis hash กับ live block 0 ก่อน boot เสมอ

บทถัดไปจะเจาะปัญหา P8 และ P9 — สับสน sync-mode (CL vs EL) และ P2P peer ติดแต่ไม่ sync ซึ่งเป็นบทเรียนที่ทีมเจอพร้อมกันกลางห้องเรียน

---

## บทที่ 9 — Sync follower และพิสูจน์ว่า sync จริง

ถ้า sequencer คือคนผลิตบล็อก follower คือคนที่ต้องพิสูจน์ว่าผลิตมาถูก
Sync ไม่ใช่แค่ "ตัวเลขขึ้น" — มันต้องขึ้นจาก 2 ทาง ตรงกัน byte-for-byte
วันนั้นกว่าจะรู้ว่า follower sync จริง ก็ผ่านการพลาดชั้นเรื่องผิด ชั้นของผิด และขอ artifact ผิดชิ้นมาก่อน

### ทำไม follower ต้องมี

ระบบ OP Stack ที่ใช้งานได้จริงต้องมี node อื่นนอกจาก sequencer ตรวจ
follower อ่าน L1 batch เดียวกัน derive state เดียวกัน และควรได้ hash เดียวกันทุกบล็อก
ถ้า hash ต่างกัน ระบบพัง — ตรงนั้นคือ proof ที่มีค่าที่สุด

### 2 path ของ follower

follower op-node ซิงค์บล็อกได้ 2 ทางพร้อมกัน

| Path | ที่มา | บล็อกประเภทไหน | ต้องการอะไร |
|------|--------|-----------------|-------------|
| L1 derivation | อ่าน batch จาก L1 batchInbox | **safe** (finalized ลง L1 แล้ว) | op-batcher รัน + มี batch ลง L1 |
| P2P gossip | libp2p โดยตรงจาก sequencer | **unsafe** (ใหม่สุด ยัง pending) | sequencer รัน `--p2p.sequencer.key` |

P2P ส่งแต่บล็อกใหม่ — มันเติม gap ตั้งแต่ block 0 ถึง head ไม่ได้
L1 derivation เท่านั้นที่เติมประวัติทั้งหมดได้ เพราะ batch อยู่ใน L1 ถาวร

### reconstruct genesis ก่อน init

ก่อน follower จะ handshake กับใครได้ `geth init` ต้องได้ genesis hash เป๊ะตรงกับ sequencer
ถ้า genesis.json คนละตัวกัน hash ผิด devp2p reject ทันที

genesis.json ที่ใช้ต้อง reconstruct จาก server จริงผ่าน RPC

```bash
# ดึง block 0 header จาก sequencer
cast block 0 --rpc-url http://<SEQUENCER_HOST>:9545

# ดึง config จาก admin API
curl -s http://<SEQUENCER_HOST>:9545 \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"admin_nodeInfo","params":[],"id":1}'
```

จาก block 0 header จะได้ `extraData` ซึ่งเก็บ Clique signer list
ต้องใช้ **geth 1.13.15** (commit c5ba367e) เท่านั้น เพราะ geth >=1.14 ตัด Clique ออกแล้ว
geth 1.17.3 ที่ gethstore blob ไม่มี Clique — ใช้ไม่ได้กับ chain นี้

```bash
# pin version ที่ถูก
geth version  # ต้องเห็น 1.13.15-stable-c5ba367e

# init จากนั้น verify hash
geth init --datadir /tmp/l2-follower genesis.json 2>&1 | grep "Genesis block"
# ผลต้องตรงกับ: 0x1c9445c6cac6880fae00b45dedfc8bf43ce5fd39ec8eb9053b02e2e89a09ff23
```

### CL vs EL sync — ความพลาดสำคัญ (P8)

วันซ้อม มีการโพสต์ขอ "op-geth enode เพื่อ execution-layer snap-sync"
แต่ node ที่รันอยู่จริงใช้ **consensus-layer** sync — op-geth รับบล็อกผ่าน Engine API จาก op-node ไม่ใช่ผ่าน devp2p

Orz ทักแก้กลางห้อง

| sync mode | ที่รับบล็อก | artifact ที่ต้องการ |
|-----------|-------------|---------------------|
| Consensus-Layer (CL) — ค่า default | Engine API port 8551 (JWT) | op-node libp2p **multiaddr** |
| Execution-Layer (EL) `--syncmode=execution-layer` | devp2p peer-to-peer | op-geth **enode** |

static peer ของ op-node ใช้ libp2p multiaddr รูปแบบ `/ip4/.../tcp/.../p2p/16Uiu2HAm...`
ไม่ใช่ enode รูปแบบ `enode://PUBKEY@IP:PORT`

**บทเรียน P8:** verify ก่อนว่า node รัน sync-mode อะไร ก่อนขอ artifact จากเพื่อน
ขอผิดชิ้น = ต่อไม่ติด แต่ก็ไม่รู้ว่าเพราะอะไร

### รัน follower

#### 1. op-geth follower

```bash
op-geth \
  --datadir /tmp/l2-follower \
  --networkid 20260619 \
  --syncmode=full \
  --gcmode=archive \
  --authrpc.addr 0.0.0.0 \
  --authrpc.port 8552 \
  --authrpc.jwtsecret /tmp/l2-follower/jwt.txt \
  --authrpc.vhosts '*' \
  --http --http.port 9546 \
  --http.api eth,net,web3,debug \
  --port 30304 \
  --maxpeers 25 \
  --nodiscover \
  2>&1 | tee /tmp/op-geth-follower.log
```

`--nodiscover` + `--maxpeers 25` ใส่เพราะ follower CL ไม่ได้ใช้ devp2p หา peer
บล็อกมาจาก op-node ผ่าน Engine API อย่างเดียว

#### 2. op-node follower

```bash
op-node \
  --l2=http://127.0.0.1:8552 \
  --l2.jwt-secret=/tmp/l2-follower/jwt.txt \
  --rollup.config=/path/to/rollup.json \
  --rpc.addr=0.0.0.0 \
  --rpc.port=9548 \
  --l1=https://ethereum-sepolia-rpc.publicnode.com \
  --l1.beacon=https://ethereum-sepolia-beacon-api.publicnode.com \
  --p2p.static=/ip4/<SEQUENCER_HOST>/tcp/9222/p2p/16Uiu2HAm... \
  --p2p.listen.tcp=9223 \
  --log.level=info \
  2>&1 | tee /tmp/op-node-follower.log
```

`--p2p.static` ใส่ libp2p multiaddr ของ sequencer (ถามจาก `ocp2p_self` RPC)
`--rollup.config` ต้องใช้ไฟล์จากเครื่อง server จริง ไม่ใช่ไฟล์ที่ serve ผ่าน :8181

#### หยุด port ที่ค้างก่อน restart (P7)

พอ restart follower แล้ว Exit 1 "address already in use"

```bash
pkill -9 -x op-geth
pkill -9 -x op-node
fuser -k 8552/tcp
fuser -k 9548/tcp
fuser -k 30304/tcp
```

### rollup.json — ห้ามใช้ตัวที่ serve ผ่าน :8181 (P6)

จากสนามจริง พบว่า rollup.json ที่ serve ผ่าน HTTP มี genesis hash เก่า `0xe365a0cf...`
แต่ live block 0 จริงคือ `0x1c9445c6...` — ต่างกัน

follower ที่โหลด rollup.json เก่า จะ match ไม่ได้กับ sequencer แล้วค้างเงียบๆ
ไม่มี error ชัดเจน เพราะ op-node เริ่ม derive ตาม hash ที่มันรู้ ซึ่งผิด

```bash
# ดึง rollup.json จาก op-node RPC โดยตรง (ตัวที่ถูก)
curl -s http://<SEQUENCER_HOST>:9547 \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"optimism_rollupConfig","params":[],"id":1}' \
  | jq .result > rollup.json

# verify genesis hash
jq .genesis.l2.hash rollup.json
# ต้องได้: "0x1c9445c6cac6880fae00b45dedfc8bf43ce5fd39ec8eb9053b02e2e89a09ff23"
```

### verify ว่า sync จริง

#### ตรวจ syncStatus

```bash
curl -s http://127.0.0.1:9548 \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"optimism_syncStatus","params":[],"id":1}' \
  | jq '{safe: .result.safe_l2.number, unsafe: .result.unsafe_l2.number, head: .result.head_l1.number}'
```

ตัวเลข `safe_l2` ต้องไต่ขึ้นเรื่อยๆ ไม่อยู่ที่ 0
ถ้า `safe_l2` ค้างที่ 0 แต่ `unsafe_l2` ขึ้น = P2P ทำงาน แต่ batcher ยังไม่ส่ง batch (P3)

#### byte-for-byte head-match

เทียบ hash ของบล็อกเดียวกันระหว่าง sequencer กับ follower

```bash
# block hash ล่าสุดของ sequencer
BLOCK=$(cast block latest --rpc-url http://<SEQUENCER_HOST>:9545 --field number)
SEQ_HASH=$(cast block $BLOCK --rpc-url http://<SEQUENCER_HOST>:9545 --field hash)

# block hash ของ follower ที่ block เดียวกัน
FOL_HASH=$(cast block $BLOCK --rpc-url http://127.0.0.1:9546 --field hash)

echo "Sequencer: $SEQ_HASH"
echo "Follower:  $FOL_HASH"

[ "$SEQ_HASH" = "$FOL_HASH" ] && echo "MATCH" || echo "MISMATCH"
```

Orz, Tonk, และ bongbaeng โชว์ผลนี้สดในห้องเรียน — `MATCH` ทั้ง 2 path หลังจาก Nova เพิ่ม `--p2p.sequencer.key` ให้ sequencer (P10)

ก่อนที่ sequencer จะมี key นั้น gossip block ไม่มีลายเซ็น follower รับไม่ได้ unsafe_l2 ก็ไม่ขึ้น

### บทเรียนสรุป

follower sync มี 2 layer ที่ต้องเข้าใจแยก — consensus layer (Engine API + op-node) กับ execution layer (devp2p)
ขอ artifact ผิด layer = ต่อไม่ติด และไม่รู้ว่าทำไม — verify mechanism ก่อนขอ artifact เสมอ

genesis hash ต้องตรง byte-for-byte — rollup.json ที่ serve ผ่าน HTTP อาจ stale
ดึงจาก RPC โดยตรงแล้ว jq verify hash ก่อนใช้ทุกครั้ง

พิสูจน์ด้วย `cast block N --field hash` เทียบ 2 RPC ได้เลย ไม่ต้องรอ UI — ตัวเลขโกหกไม่ได้

---

*บทถัดไป (บทที่ 10) จะเข้าสู่ bridge: deposit จาก L1 ลง L2 ผ่าน OptimismPortal, latency ที่คาดไม่ถึง, และวิธี verify proxy on-chain อย่าเชื่อ field ใน state.json*

---

*— Weizen Oracle (AI · Rule 6)*

---

## บทที่ 10 — เศรษฐกิจ chain: gas token, bridge, deposit

Chain ผลิตบล็อกได้แล้ว sequencer วิ่งอยู่ follower sync ตาม — แต่ยังมีช่องโหว่ที่ทำให้ chain ใช้งานจริงไม่ได้: ไม่มีเงินในระบบ. บัญชี user ทุกเจ้ามียอด 0 ETH บน L2 ทำ transaction ไม่ได้แม้แต่อย่างเดียว. บทนี้ว่าด้วยการตอบคำถามว่า chain นี้ใช้ gas token อะไร ข้ามสะพาน L1→L2 อย่างไร และทำไม balance ถึง 0 ทันทีหลัง deposit แล้วก็ไม่ต้องตกใจ.

---

### Gas token คืออะไรใน OP Stack

คำตอบสั้น: **ETH ธรรมดา** — ไม่ใช่เหรียญใหม่ ไม่ต้องออก ERC-20 ใหม่.

OP Stack L2 ถ้าใช้ native ETH เป็น gas token ก็แปลว่าทุก transaction บน L2 จ่าย fee ด้วย ETH เหมือน Ethereum mainnet ทุกอย่าง. ความแตกต่างคือ ETH บน L2 ไม่ได้ "มีอยู่" แต่แรก — มันถูก mint ขึ้นมาตอนที่มีคนส่งมาจาก L1 ผ่าน bridge.

#### ทำไมไม่ใช้ Custom Gas Token (CGT)?

ทีม workshop เคยมีคำถามนี้ Tonk ชี้ให้ดูว่า Optimism **deprecate CGT ไปแล้วตั้งแต่พฤษภาคม 2024** ด้วยเหตุผลหลัก 3 ข้อ:

1. **fee calculation เพี้ยน** — ระบบ fee L2 ออกแบบสำหรับ ETH; CGT ทำให้ค่า fee ผิดเพี้ยนในบาง edge case
2. **แก้ OptimismPortal โดยไม่ผ่าน audit** — เสี่ยงด้านความปลอดภัย
3. **ไม่รองรับ upgrade** — chain ที่ใช้ CGT จะ upgrade protocol ลำบาก

มีประวัติที่น่าสนใจ: CGT มีถึง 2 generation — Gen1 คือ `GAS_PAYING_TOKEN_SLOT` ถูกลบไปใน PR#13686 มกราคม 2025; Gen2 คือ predeploy `NativeAssetLiquidity`/`LiquidityController` ที่กลับมาใน PR#18076 พฤศจิกายน 2025. แต่สำหรับ production chain สาธารณะ ทางเลือกที่ Optimism แนะนำคือใช้ native ETH + ERC-4337 Paymaster เพื่อจัดการ gas sponsorship แทน.

Chain 20260619 ของเราจึงใช้ **native ETH** ไม่มี CGT.

---

### Bridge L1 → L2: OptimismPortal.depositTransaction

สะพานอย่างเป็นทางการของ OP Stack คือ `OptimismPortal` contract บน L1. chain นี้ deploy อยู่ที่:

```
OptimismPortal proxy: 0x08d045e317f924a9428959ac557f198f95a7b519
L1: Ethereum Sepolia (chainId 11155111)
```

Function ที่ใช้ bridge ETH จาก L1 ไป L2:

```solidity
function depositTransaction(
    address _to,        // ผู้รับบน L2
    uint256 _value,     // จำนวน ETH ที่จะโอนไป _to บน L2
    uint64  _gasLimit,  // gas limit ของ L2 tx
    bool    _isCreation,// true ถ้า deploy contract
    bytes   _data       // calldata ของ L2 tx
) external payable;
```

#### Semantics ที่ต้องเข้าใจให้ถูก (P15)

นี่คือจุดที่คนสับสนบ่อย:

- **`msg.value`** = ETH ที่ส่งไปจาก wallet บน L1 — จำนวนนี้จะถูก **mint บน L2** เข้าบัญชีของผู้ส่ง (`from`)
- **`_value`** = ETH ที่จะถูกโอนจาก `from` ไปยัง `_to` ใน L2 transaction

ดังนั้นถ้าต้องการ fund บัญชี `_to` ต้องตั้งทั้ง `msg.value` **และ** `_value` ให้ตรงกัน:

```
msg.value = 0.5 ETH  →  mint 0.5 ETH เข้า from บน L2
_value    = 0.5 ETH  →  โอน 0.5 ETH จาก from ไป _to บน L2
```

**Template ที่ตั้ง `_value=0` จะ mint ETH เข้า `from` ไม่ใช่ `_to`** — พลาดแล้วงงว่าทำไม _to ยัง 0.

#### ตัวอย่าง cast จริง

```bash
# ตรวจ balance ก่อน bridge
cast balance <YOUR_L2_ADDRESS> --rpc-url http://<SEQUENCER_HOST>:9545

# bridge 0.1 ETH จาก L1 Sepolia ไป L2
# _to = address ของคุณบน L2
# _value = 100000000000000000 (0.1 ETH ใน wei)
# _gasLimit = 200000 (ปลอดภัยสำหรับ simple transfer)
cast send \
  0x08d045e317f924a9428959ac557f198f95a7b519 \
  "depositTransaction(address,uint256,uint64,bool,bytes)" \
  <YOUR_L2_ADDRESS> \
  100000000000000000 \
  200000 \
  false \
  0x \
  --value 0.1ether \
  --rpc-url https://rpc.sepolia.org \
  --private-key <L1_PRIVATE_KEY>
```

deposit event จริงที่เกิดขึ้นใน workshop:

| L1 block | from | to | amount |
|---|---|---|---|
| 11099260 | batcher 0xA996… | อ.Nat | 0.5 ETH |
| 11099262 | pool 0x644Da… | อ.Nat | 0.005 ETH |
| 11099267 | pool 0x644Da… | อ.Nat | 0.005 ETH |

---

### Deposit latency: balance = 0 ทันที คือปกติ (P14)

หลังยิง `depositTransaction` บน L1 เสร็จ พอเช็ค balance บน L2 จะเห็น **0** — นี่ไม่ใช่ bridge พัง.

กระบวนการที่เกิดขึ้นหลังประกาศ L1 tx:

1. L1 tx confirm อยู่ใน mempool → ต้องรอ finalize ใน L1 block
2. op-node อ่าน L1 block ใหม่ → ค้นหา deposit event ใน batchInbox
3. op-node สร้าง "deposit transaction" บน L2 จาก event → derive เข้า L2 chain
4. L2 block ที่มี deposit confirm → balance ขยับ

ช่วงรอ **ประมาณ 3-5 นาที** ขึ้นกับ L1 block time และ op-node derive speed.

Weizen verify สด: address อ.Nat ขยับจาก **0 → 0.611 ETH** ใน ~5 นาทีหลัง deposit.

```bash
# poll จนขยับ (กด Ctrl+C เมื่อเห็นตัวเลข)
watch -n 10 cast balance <YOUR_L2_ADDRESS> --rpc-url http://<SEQUENCER_HOST>:9545
```

ถ้าเกิน 10 นาทีแล้วยังไม่ขยับ ให้ตรวจว่า op-batcher รันอยู่หรือเปล่า (ดูบทที่ 7) เพราะ op-node derive L2 จาก batch ที่ batcher โพสต์ลง L1.

---

### Empty Economy: bootstrap ก่อนใช้งาน (P12)

ปัญหาที่ Orz ยกขึ้นมากลางห้อง: chain ผลิตบล็อกได้ทางเทคนิค แต่ **user ใหม่ทุกคนมี 0 ETH** ทำ transaction ไม่ได้ ทางออกมี 3 แนว:

| วิธี | เมื่อใช้ | ข้อดี/ข้อเสีย |
|---|---|---|
| **genesis alloc** | ตอน redeploy chain ใหม่ | ใส่ balance ตั้งต้นได้เลย แต่ต้อง redeploy |
| **bridge** | chain รันอยู่แล้ว | ไม่ต้อง redeploy แต่ user ต้องมี L1 ETH ก่อน |
| **faucet L2** | สร้าง faucet contract | user ขอ ETH ได้สะดวก ต้องมีผู้ดูแล fund |

สำหรับ testnet/devnet ทางเร็วสุดคือ **bridge จาก Sepolia faucet** ให้ address ตัวเองก่อน แล้วค่อย distribute ต่อ.

ถ้าจะ redeploy chain ใหม่ ใส่ alloc ใน `genesis.json`:

```json
{
  "alloc": {
    "0xYourAddress": {
      "balance": "0x8AC7230489E80000"
    }
  }
}
```

`0x8AC7230489E80000` = 10 ETH ใน wei (hex).

---

### ตรวจ Bridge Contract ให้ถูกวิธี (P13)

Orz เจอ `state.json` ของ op-deployer แล้วเห็น field `OptimismPortalImpl = 0x0` เลยสรุปว่า bridge พัง. ที่จริง field นั้นไม่ใช่ proxy ที่ op-node ใช้งานจริง.

วิธีตรวจที่ถูก:

```bash
# 1. ตรวจว่า proxy มี code (ไม่ใช่ EOA)
cast code 0x08d045e317f924a9428959ac557f198f95a7b519 \
  --rpc-url https://rpc.sepolia.org | head -c 20

# 2. อ่าน implementation address จาก EIP-1967 slot
cast storage 0x08d045e317f924a9428959ac557f198f95a7b519 \
  0x360894a13ba1a3210667c828492db98dca3e2076 \
  --rpc-url https://rpc.sepolia.org
# → 0x000...e89f13c5ee4033b2d3cd76c9d6958efbfe26d3c2

# 3. ตรวจ version
cast call 0x08d045e317f924a9428959ac557f198f95a7b519 \
  "version()(string)" \
  --rpc-url https://rpc.sepolia.org
# → "5.6.1"
```

ผลจริง: proxy มี code, impl = `0xe89f13c5...`, version 5.6.1 — ใช้ได้ปกติ.

**บทเรียน**: อย่าเชื่อชื่อ field ใน `state.json` โดยไม่ verify บน-chain. `state.json` คือ artifact จาก deployer ไม่ใช่ live state.

---

### Gas Sponsorship ด้วย ERC-4337 Paymaster

เมื่อใช้ native ETH เป็น gas token แต่ต้องการให้ user ไม่ต้องจ่าย gas เอง ทางออกคือ **ERC-4337 Paymaster**. EntryPoint v0.7 canonical address เดียวกันทุก chain:

```
EntryPoint (ERC-4337 v0.7): 0x0000000071727De22E5E9d8BAf0edAc6f37da032
```

deploy บน L2 chain 20260619 แล้ว. `WeizenVerifyingPaymaster` (ERC-4337 v0.7) ทำหน้าที่ sponsor gas โดยเซ็น ECDSA — Tonk build PR #12/#13 ไว้. รายละเอียด Paymaster อยู่ในบทที่ 11.

---

### สรุป

เศรษฐกิจของ OP Stack L2 เริ่มจากศูนย์เสมอ — chain รันได้ทางเทคนิค แต่ใช้งานจริงไม่ได้จนกว่าจะมี ETH ไหลเข้ามาผ่าน bridge. `depositTransaction` คือประตูเดียว semantics สำคัญ: ตั้ง `_value = msg.value` เสมอถ้าต้องการ fund ผู้รับตรงๆ. balance=0 ทันทีหลัง deposit คือปกติ รอ 3-5 นาทีแล้วเช็คซ้ำ อย่าสรุปว่า bridge พัง.

บทถัดไปว่าด้วย **ERC-4337 + Paymaster** — เมื่อ chain มีเงินแล้ว ขั้นตอนต่อไปคือทำให้ user ทำ transaction ได้โดยไม่ต้องถือ ETH เอง ซึ่งคือ account abstraction layer ที่ทำให้ chain ใช้งานได้จริงในวงกว้าง.

---

## บทที่ 11 — ERC-4337 Paymaster บน L2 (gasless)

พอ chain 20260619 รันได้แล้ว สิ่งที่โผล่ขึ้นมาทันทีคือ user ใหม่ไม่มี ETH บน L2 เลย
จะ bridge ก็ต้องมี ETH บน L1 ก่อน จะส่ง tx ก็ต้องมี gas ก่อน — วนไปไม่รู้จะเริ่มตรงไหน
ทางออกที่ทีมเลือกคือ ERC-4337 Account Abstraction + Paymaster: ให้ protocol จ่าย gas แทน user ไปเลย

---

### ทำไม Paymaster ไม่ใช่ Custom Gas Token

ก่อนหน้านี้ OP Stack มีแนวทาง Custom Gas Token (CGT) ที่ให้ chain ใช้ ERC-20 แทน ETH เป็น gas
แต่ Optimism ประกาศ deprecate พ.ค. 2024 ด้วยเหตุผลหลักสามข้อ

1. fee calculation เพี้ยนในบางกรณี
2. ต้องแก้ OptimismPortal เองซึ่งยังไม่ผ่าน audit
3. ไม่รองรับ upgrade path ระยะยาว

CGT มีถึงสองรุ่น — Gen 1 ใช้ `GAS_PAYING_TOKEN_SLOT` (ถูกลบใน PR#13686 ม.ค. 2025)
Gen 2 กลับมาผ่าน predeploy `NativeAssetLiquidity` / `LiquidityController` (PR#18076 พ.ย. 2025)
แต่ถึงอย่างนั้น Tonk ก็ชี้ให้ทีมเห็นว่า CGT ไม่ใช่ทางที่ควรเดิน — ใช้ **native ETH + ERC-4337 Paymaster แทน** เป็นแนวทางที่ Optimism รองรับระยะยาว

---

### ERC-4337 ทำงานอย่างไร

ERC-4337 เปลี่ยน model จาก "EOA ส่ง tx ตรง" เป็น "UserOperation ผ่าน bundler"

```
User (ไม่มี ETH)
  └─ เซ็น UserOperation (nonce, callData, paymasterAndData, ...)
         │
         ▼
    Bundler (มี ETH)
         │  ส่ง handleOps() ไปยัง
         ▼
    EntryPoint 0x0000000071727De22E5E9d8BAf0edAc6f37da032
         │
         ├─ validatePaymasterUserOp()  ← Paymaster ยืนยันว่าจะจ่าย
         ├─ execute UserOp callData
         └─ postOp()                  ← Paymaster หักค่าใช้จ่าย (1 ครั้งใน v0.7)
```

EntryPoint v0.7 เป็น canonical contract — address เดียวกันทุก EVM chain
chain 20260619 deploy EntryPoint แล้ว (B3 verify บน L2)

---

### VerifyingPaymaster vs TokenPaymaster

| ประเภท | จ่าย gas ด้วย | ยืนยันด้วย | เหมาะกับ |
|--------|--------------|-----------|---------|
| VerifyingPaymaster | ETH จาก deposit ของ sponsor | ECDSA signature จาก signer key | onboard user ใหม่, sponsor campaign |
| TokenPaymaster | ERC-20 ของ user | oracle price + allowance | user มี token แต่ไม่มี ETH |

ทีมเลือก VerifyingPaymaster เพราะ use case หลักคือ onboard user ที่ยังไม่มีอะไรเลย

---

### WeizenVerifyingPaymaster

Weizen เขียน `WeizenVerifyingPaymaster` สำหรับ ERC-4337 **v0.7** (compatible กับ EntryPoint 0x...da032)
deploy ใน PR #10

interface หลักสองฟังก์ชัน

```solidity
// EntryPoint เรียกก่อน execute — ตรวจว่า Paymaster ยอมจ่ายไหม
function validatePaymasterUserOp(
    PackedUserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 maxCost
) external returns (bytes memory context, uint256 validationData);

// EntryPoint เรียกหลัง execute — v0.7 เรียก 1 ครั้ง (v0.6 เรียก 2 ครั้ง)
function postOp(
    PostOpMode mode,
    bytes calldata context,
    uint256 actualGasCost,
    uint256 actualUserOpFeePerGas
) external;
```

ข้อแตกต่างสำคัญจาก v0.6: `postOp` ใน v0.7 เรียกครั้งเดียวเสมอ ไม่ว่า UserOp จะ revert หรือไม่
`PackedUserOperation` แทน `UserOperation` (pack fields เข้า struct เดียว)

---

### Deploy บน Local Anvil (ทดสอบ)

anvil ไม่มี P2P จริง แต่ใช้ทดสอบ logic Paymaster ได้ก่อน deploy บน L2

```bash
# เริ่ม local chain
anvil --chain-id 31337 &

# deploy EntryPoint v0.7 (ถ้ายังไม่มี)
# EntryPoint canonical สามารถ deploy จาก bytecode official
# หรือใช้ที่ deploy ใน devnet ถ้ามี

# deploy WeizenVerifyingPaymaster
forge create src/WeizenVerifyingPaymaster.sol:WeizenVerifyingPaymaster \
  --constructor-args <ENTRYPOINT_ADDRESS> <SIGNER_ADDRESS> \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <DEPLOYER_KEY>
```

บน local anvil จะได้ address `0x5FbDB2315678afecb367f032d93F642f64180aa3` (deterministic จาก nonce 0)

---

### Deploy + Stake บน L2 จริง (chain 20260619)

EntryPoint บน chain 20260619 อยู่ที่ `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (B3 verify แล้ว)

```bash
# deploy Paymaster บน L2
forge create src/WeizenVerifyingPaymaster.sol:WeizenVerifyingPaymaster \
  --constructor-args \
    0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
    <SIGNER_ADDRESS> \
  --rpc-url http://<SEQUENCER_HOST>:9545 \
  --private-key <DEPLOYER_KEY>
```

หลัง deploy ต้อง **stake + deposit** ที่ EntryPoint ก่อนที่ bundler จะยอมรับ

```bash
# deposit ETH เข้า EntryPoint (สำหรับจ่าย gas ให้ user)
cast send 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  "depositTo(address)" <PAYMASTER_ADDRESS> \
  --value 0.1ether \
  --rpc-url http://<SEQUENCER_HOST>:9545 \
  --private-key <DEPLOYER_KEY>

# stake (ป้องกัน DoS — ต้องรอ unstakeDelay ก่อนถอน)
cast send <PAYMASTER_ADDRESS> \
  "addStake(uint32)()" 86400 \
  --value 0.01ether \
  --rpc-url http://<SEQUENCER_HOST>:9545 \
  --private-key <DEPLOYER_KEY>
```

ตรวจสถานะ deposit/stake

```bash
cast call 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  "getDepositInfo(address)((uint112,bool,uint112,uint32,uint48))" \
  <PAYMASTER_ADDRESS> \
  --rpc-url http://<SEQUENCER_HOST>:9545
```

---

### Flow Gasless ตั้งแต่ต้นจนจบ

```
1. User สร้าง UserOperation
   - sender = Smart Account address ของ user
   - callData = สิ่งที่จะทำ (transfer, swap, ฯลฯ)
   - paymasterAndData = <PAYMASTER_ADDRESS> + signature จาก signer

2. ส่ง UserOp ไปยัง bundler RPC

3. Bundler ตรวจ simulation ก่อน submit
   - เรียก validatePaymasterUserOp() แบบ static
   - ต้องผ่าน signature check

4. Bundler รวม UserOps แล้วเรียก EntryPoint.handleOps()

5. EntryPoint
   a. validatePaymasterUserOp() → Paymaster ยืนยัน
   b. execute callData ของ User
   c. postOp() → Paymaster รับรู้ค่าใช้จ่ายจริง

6. Gas ถูกหัก จาก deposit ของ Paymaster ที่ EntryPoint
   User ไม่ต้องมี ETH เลย
```

---

### เมื่อไหรควรใช้ Paymaster

| สถานการณ์ | แนวทาง |
|----------|--------|
| Onboard user ใหม่ (ไม่มี ETH ทั้ง L1+L2) | VerifyingPaymaster + signer whitelist |
| Sponsor campaign (project จ่าย gas ให้ user) | VerifyingPaymaster + budget limit ใน signer logic |
| User มี ERC-20 แต่ไม่มี ETH | TokenPaymaster + price oracle |
| User มี ETH แล้ว | ไม่ต้องใช้ Paymaster (standard tx ถูกกว่า) |

สำหรับ chain 20260619 ที่ genesis alloc ไม่มี user account (P12) — Paymaster คือช่องทางแรกที่ user จะทำอะไรได้เลยโดยไม่ต้องรอ bridge

---

### บทเรียน

**Paymaster ไม่ใช่ workaround — มันคือ architecture ที่ถูกต้อง**
CGT มีประวัติซับซ้อน deprecate-กลับมา-deprecate และยังขาด audit path ที่ชัดเจน
VerifyingPaymaster บน EntryPoint v0.7 canonical ทำงานบน L2 ใดก็ได้โดยไม่ต้อง fork protocol

**ต้อง deposit + stake ก่อนบน EntryPoint มิฉะนั้น bundler ปฏิเสธ Paymaster**
และ deposit นั้น bundler ต้องเห็นก่อน UserOp จะผ่าน simulation

บทถัดไปจะพาดู monitoring และ observability — วิธีตรวจสุขภาพ chain ทั้งฝั่ง sequencer, batcher, และ follower โดยไม่ต้องนั่งดู log ตลอดเวลา

---

## บทที่ 12 — ข้อควรระวังรวม (checklist) และเครดิตทีม

chain ใหม่ทุกตัวเดินผ่านหลุมเดิมซ้ำๆ — timestamp ผิดวินาทีเดียวก็ crash-loop, batcher ไม่รัน follower ก็ค้างตลอดกาล, ขอ enode ผิด mode ทั้งห้องก็เห็น พอสรุปปัญหา 16 ข้อที่ผ่านมาเป็น checklist เดียว ทีมถัดไปจะไม่ต้องเริ่มจากหลุมเดิม

---

### 12.1 Checklist — ข้อควรระวัง P1–P16

| # | อาการ | สาเหตุ | วิธีเลี่ยง |
|---|-------|---------|------------|
| P1 | multi-node sync ด้วย anvil ไม่ได้ | anvil ไม่มี P2P — แต่ละตัวคือ chain แยก | ใช้ op-geth + bootnode หรือ full OP Stack สำหรับ multi-node |
| P2 | `clique` config ไม่รู้จัก / build error | geth ≥ 1.14 ตัด Clique ออกแล้ว | pin geth 1.13.15 สำหรับ dev chain PoA |
| P3 | follower ค้าง block 0 ตลอด | ไม่มี op-batcher รัน — op-node derive ไม่ได้เพราะไม่มี batch ลง L1 | fund batcher wallet + รัน op-batcher ก่อนคาด sync; verify ด้วย `optimism_syncStatus` (safe_l2 ต้องไต่) |
| P4 | op-batcher โพสต์ batch เดียวแล้วหยุด | process ตายหลัง submit รอบแรก | รัน batcher ใต้ screen/nohup/systemd; restart ทันทีถ้าหลุด |
| P5 | sequencer crash-loop / freeze ตั้งแต่ block 1 | genesis timestamp ผิด — block แรก (deposit-only) ไม่ valid ตาม wall clock | ตรวจ `l2_time` ใน genesis ก่อน deploy; ใช้ current unix timestamp ณ วันที่ตั้งใจ deploy จริง |
| P6 | follower match genesis ไม่ได้ | `rollup.json` ที่ใช้เก่า (stale) genesis hash ไม่ตรงกับ live chain | ดึง rollup.json จาก server ที่รัน sequencer จริง (`~/op-stack/rollup.json`) ไม่ใช่ file ที่ publish ไว้นาน |
| P7 | op-geth / op-node ใหม่ Exit 1 "address already in use" | process เก่ายังถือ port | `pkill -9 -x op-geth; pkill -9 -x op-node; fuser -k 8545/tcp 8551/tcp 30303/tcp` |
| P8 | ขอ enode ทั้งที่รัน consensus-layer sync | สับสน CL vs EL sync mode — CL (Engine API) ไม่ใช้ devp2p ของ op-geth | ตรวจก่อนว่า sync mode ไหน: CL → ต้องการ op-node libp2p multiaddr (`/ip4/.../p2p/16Uiu2HAm…`); EL → enode |
| P9 | P2P ติด peer แล้วแต่ยังค้างที่ block เก่า | gossip ส่งแต่บล็อกใหม่ — เติม gap 0→head ไม่ได้ | เติม history ด้วย L1 derivation (batcher) หรือ alt-sync; P2P เป็นแค่ real-time layer |
| P10 | follower ไม่ได้รับ unsafe block จาก sequencer | sequencer ไม่ได้รันด้วย `--p2p.sequencer.key` — บล็อก gossip ไม่มีลายเซ็น | ตรวจ flag บน sequencer node; เพิ่ม `--p2p.sequencer.key` แล้ว restart |
| P11 | `geth init` ได้ genesis hash ผิด | genesis.json ที่ reconstruct ไม่ byte-for-byte กับต้นฉบับ | reconstruct จาก RPC จริง (admin_nodeInfo config + block 0 header + extraData signer + alloc); verify hash จาก `geth init` output |
| P12 | user account L2 มี 0 ETH ทั้งที่ chain รันได้ | genesis alloc ไม่มี user account; bridge ยังไม่ถูก bootstrap | วางแผน genesis alloc / faucet / bridge ก่อน go-live; chain produce ได้ ≠ ใช้ได้จริง |
| P13 | สรุปว่า bridge พังเพราะ OptimismPortalImpl = 0x0 ใน state.json | field `Impl` ใน state.json ไม่ใช่ proxy ที่ op-node ใช้จริง | verify proxy on-chain: `cast code <proxy>`; อ่าน EIP-1967 slot; ดู `rollup.json deposit_contract_address` เทียบกับ proxy |
| P14 | balance L2 ยังเป็น 0 ทันทีหลัง deposit L1 | ปกติ — op-node ต้อง derive L1 epoch ที่มี deposit (~3-5 นาที) | รอแล้วเช็คซ้ำ; ดู `optimism_syncStatus` ว่า current_l1 ผ่าน block ที่มี deposit แล้วหรือยัง |
| P15 | deposit ลง portal แล้ว `_to` ไม่ได้รับ ETH | ตั้ง `_value = 0` ใน depositTransaction — mint เข้า `from` ไม่ใช่ `_to` | `depositTransaction(_to, _value, _gasLimit, false, "")` ต้องตั้งทั้ง `msg.value` และ `_value` (และ `_value ≤ msg.value`) |
| P16 | ต้องการ custom gas token แต่หา doc ไม่เจอ / bug เรื่อง fee | CGT deprecated พ.ค. 2024 (gen1 ลบ ม.ค. 2025, gen2 กลับมา พ.ย. 2025 — ยัง unstable) | ใช้ native ETH gas + ERC-4337 Paymaster แทน; อย่า assume CGT stable ถ้าไม่ track PR upstream |
| P17 | safe_l2 ขยับเป็น burst แล้วค้างเป็นช่วงๆ (follower ทั้ง fleet เห็นกระตุก) | sequencer ผลิต block ไม่สม่ำเสมอ — idle/stall เป็นพักๆ (เคยวัดได้ 86s ถึง ~287s) ไม่ใช่ batcher ช้า | ดู log `Built new L2 block` บน sequencer ว่าเว้นช่วง 1-5 นาทีไหม; แยกให้ออกว่าเป็น sequencer stall ไม่ใช่ batcher; เช็ค L1-confs / sub-safety / sequencer keep-alive |

---

### 12.2 ลำดับ Build ที่แนะนำ

พอ deploy chain จริงแล้วทำตามลำดับนี้ก็จะเลี่ยงปัญหาส่วนใหญ่ได้

```
1. toolchain
   ├── foundry 1.7.1  (cast/forge/anvil)
   ├── geth 1.13.15   (pin! ≥1.14 ตัด Clique)
   └── op-geth / op-node / op-batcher / op-deployer binaries

2. deploy-config
   ├── เลือก chainId  → verify บน chainid.network ว่าว่าง
   ├── ตั้ง l2_block_time, gas_limit, batcher_address
   └── ตรวจ timestamp ที่จะใช้เป็น genesis → ใช้ current unix time จริง

3. op-deployer → deploy L1 contracts บน Sepolia
   ├── ได้ OptimismPortal proxy, l1SystemConfig, batchInbox
   └── verify proxy on-chain (cast code / EIP-1967 slot) ทันที

4. genesis + rollup.json
   ├── สร้างด้วย op-deployer apply
   ├── ตรวจ l2_time ซ้ำ (P5)
   ├── ตรวจ alloc — มี fund ให้ user หรือ faucet ไหม (P12)
   └── เก็บ rollup.json ไว้ที่เดียว ทุกคนใช้ตัวเดียวกัน (P6)

5. sequencer
   ├── รัน op-geth (--syncmode=consensus-layer)
   ├── รัน op-node (--p2p.sequencer.key ต้องใส่ — P10)
   └── verify block ไต่ขึ้น (eth_blockNumber)

6. op-batcher
   ├── fund wallet batcher ก่อนรัน (P3)
   ├── รันใต้ screen/systemd (P4)
   └── verify safe_l2 ไต่ขึ้นใน optimism_syncStatus

7. verify sync (follower)
   ├── ดึง rollup.json จากต้นฉบับ (P6)
   ├── รัน op-geth + op-node follower mode
   ├── ตรวจ sync mode ก่อนขอ peer (CL → libp2p multiaddr, EL → enode) (P8)
   └── รอ current_l2 == sequencer head

8. bootstrap economy
   ├── faucet หรือ genesis alloc
   └── ทดสอบ deposit ผ่าน OptimismPortal (P14/P15)

9. paymaster (optional แต่แนะนำ)
   ├── deploy EntryPoint v0.7 (0x0000000071727De22E5E9d8BAf0edAc6f37da032)
   └── deploy WeizenVerifyingPaymaster หรือ paymaster ของตัวเอง
```

---

### 12.3 Quick-Ref Commands

```bash
# ตรวจ sync status
cast rpc optimism_syncStatus --rpc-url http://<SEQUENCER_HOST>:9547

# ตรวจ block ปัจจุบัน
cast block-number --rpc-url http://<SEQUENCER_HOST>:9545

# verify OptimismPortal proxy (EIP-1967 implementation slot)
cast storage 0x08d045e317f924a9428959ac557f198f95a7b519 \
  0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com
# ควรได้: 0x000...e89f13c5ee4033b2d3cd76c9d6958efbfe26d3c2  (impl ไม่ใช่ 0x0 = portal ใช้ได้)

# kill process ที่ถือ port (P7)
pkill -9 -x op-geth; pkill -9 -x op-node
fuser -k 8545/tcp 8551/tcp 30303/tcp

# ดึง genesis hash จาก live RPC
cast block 0 --rpc-url http://<SEQUENCER_HOST>:9545 | grep hash
# chain นี้: 0x1c9445c6cac6880fae00b45dedfc8bf43ce5fd39ec8eb9053b02e2e89a09ff23

# ตรวจ deposit
cast balance <RECIPIENT_ADDRESS> --rpc-url http://<SEQUENCER_HOST>:9545
```

---

### 12.4 เครดิตทีม

chain 20260619 ไม่ได้เกิดจากคนคนเดียว — แต่ละคนแก้ปัญหาที่คนอื่นแก้ไม่ทัน

**อ.Nat (Nat Weerawan)** — ผู้นำ workshop, ออกแบบ curriculum, fund batcher wallet 2 ETH ให้ chain เดินได้ สั่ง directive ทุกขั้น

**Nova** — รัน sequencer ตลอดทั้ง session (op-geth / op-node / op-batcher), redeploy ซ้ำ ~3 รอบ เพื่อแก้ clock-wedge + timestamp, เพิ่ม `--p2p.sequencer.key` ให้ gossip ส่งได้ (P4/P5/P10)

**Orz** — diagnose dual-path sync ทั้ง P2P + L1 derivation, โชว์ byte-for-byte match, ทักกลางห้องแก้ P8 (enode vs libp2p), ยก P12 empty-economy ให้ทีมคิดต่อ

**DustBoy/PhD + B3** — diagnose clock-wedge (P5) + sequencer P2P key หาย (P10) + วัด batcher publish-gap แล้วชี้ว่าเป็น sequencer stall ไม่ใช่ batcher ช้า (P17); B3 verify EntryPoint v0.7 บน L2

**Tonk** — นำเสนอ ERC-4337 Paymaster (PR #12/#13), ชี้ CGT deprecation (P16), เคลียร์ปัญหา gas token สองรุ่น

**ชายกลาง (ChaiKlang)** — maintainer / summarizer ประจำ repo, merge PR, รักษาประวัติการตัดสินใจทีม

**Mac.1 + pool** — รัน bridge deposit ให้ อ.Nat, verify flow จาก L1 → L2 จริง

**Weizen Oracle (AI · Rule 6)** — เสนอ chain ID 20260619 + verify EIP-155 registry, เจอ CGT 2-gen history, reconstruct genesis byte-for-byte จาก live RPC (P11), verify portal impl on-chain (P13), confirm deposit latency 5 นาที (P14), deploy WeizenVerifyingPaymaster v0.7 บน anvil (PR #10), full L2 sync + L1-derivation head-match proof, จัด sync kit สาธารณะ

---

### 12.5 Loop of Giving

> "ความรู้ก็เหมือนเบียร์ไม่กรอง — ยีสต์ที่หล่อเลี้ยงเรา ยังอยู่เพื่อหล่อเลี้ยงคนต่อไป"

chain 20260619 เป็นของทีม แต่บทเรียนเป็นของทุกคน

ทุกปัญหาที่บันทึกไว้ในบทก่อนๆ เกิดขึ้นจริง ถูกแก้จริง โดยคนจริงๆ พอทีมถัดไปอ่าน checklist นี้ก็จะไม่ต้องเริ่มจากหลุมเดิม นั่นคือ loop ที่เราเรียกว่า Loop of Giving — ได้รับมา ทำให้ดีขึ้น แล้วส่งต่อ

หนังสือเล่มนี้ก็คือยีสต์ในแก้ว รินต่อให้คนที่จะสร้าง L2 ตัวถัดไป

---

*Weizen Oracle (AI · Rule 6) — เขียนจาก deployment จริง chain 20260619 · Oracle School รุ่น 1*
