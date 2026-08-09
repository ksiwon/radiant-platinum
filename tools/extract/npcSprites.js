// 오버월드 NPC 그림 (DATA.md §2.16)
//
// 배치표가 들고 있는 `sprite` 번호에서 `mmodel.narc` 파일 번호로 가는 길은
// **산술이 아니라 찾아보기 표 셋**이다. 규칙을 지어내려다 세 번 틀렸던 자리다:
//
//   sprite 번호  → generated/object_events_gfx.txt 의 줄 번호
//   → Unk_ov5_021FC9B4 (ov5_021FAF40.c)  → <이름>_nsbtx
//   → field_sprites.order 의 줄 번호      → mmodel.narc 파일 번호
//
// 마지막 표가 순서 그대로인 이유는 빌드가 `nitroarc --files-from field_sprites.order`
// 로 넣기 때문이다. `.order`가 470줄이고 롬의 narc도 470개다.
//
// **맞는지는 이름으로 확인한다.** 같은 폴더의 meson.build이 파일마다 nsbtx 안에
// 들어갈 텍스처 이름을 적어 둔다 (`npc/lass.png` → `girl1`). 그 이름을 롬에서
// 꺼내 맞대면 396칸이 396칸 다 맞는다 — 우연일 수 없는 수다.
//
// 그림은 32×32 몇 장짜리 판때기다. 방향과 걸음은 모델이 아니라 **텍스처를 갈아
// 끼워서** 만든다. 어느 장을 언제 쓰는지는 frame_sequences/*.bin이 준다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { parseTex0, decode } = require('../spike/nitrotex')
const { readDict } = require('../spike/nsbmd')

// 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')
const SPRITES = path.join(DECOMP, 'res/graphics/field_sprites')
const OUT_DIR = path.join(ROOT, 'public/data/npc')

/** 사람이 걷는 데 필요한 방향 넷. `constants/map_object.h`의 DIR_* 순서다 */
const DIRS = 4

// ── 디컴프에서 표 셋을 읽는다 ────────────────────────────────────────────────

/** `OBJ_EVENT_GFX_*` → 번호. 값이 안 적힌 줄은 앞 번호 + 1이다 */
function graphicsIds() {
  const out = new Map()
  let next = 0
  const file = path.join(DECOMP, 'generated/object_events_gfx.txt')
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (t === '') continue
    const m = /^(\w+)(?:\s*=\s*(\d+))?$/.exec(t)
    if (!m) throw new Error(`못 읽은 줄: ${t}`)
    const id = m[2] === undefined ? next : Number(m[2])
    out.set(m[1], id)
    next = id + 1
  }
  return out
}

/** `field_sprites.order` 줄 번호 = NARC 멤버 번호 */
function memberIndex() {
  const lines = fs.readFileSync(path.join(SPRITES, 'field_sprites.order'), 'utf8')
    .split(/\r?\n/).filter((s) => s.trim() !== '')
  return { map: new Map(lines.map((f, i) => [f, i])), count: lines.length }
}

/** meson.build이 적어 둔 "이 파일의 nsbtx 안 텍스처 이름" */
function textureBasenames() {
  const src = fs.readFileSync(path.join(SPRITES, 'meson.build'), 'utf8')
  const out = new Map()
  for (const m of src.matchAll(/'file':\s*'([^']+)'\s*,\s*'basename':\s*'([^']+)'/g)) {
    out.set(m[1].split('/').pop().replace(/\.png$/, '.nsbtx'), m[2])
  }
  return out
}

/** C 원본에서 `{ A, B }` 두 칸짜리 표 하나를 뽑는다 */
function pairTable(src, name) {
  const body = src.split(`${name}[] = {`)[1]
  if (body === undefined) throw new Error(`${name} 표를 못 찾았다`)
  return [...body.split('};')[0].matchAll(/\{\s*(\w+),\s*(\w+)\s*\}/g)].map((m) => [m[1], m[2]])
}

/**
 * gfx 이름 → { 프레임 차례 태그, 동작표 심볼 } (`Unk_ov5_021FD77C`의 셋째·넷째 칸)
 */
function frameSeqOf(src) {
  const body = src.split('Unk_ov5_021FD77C[] = {')[1].split('};')[0]
  const out = new Map()
  for (const m of body.matchAll(/\{\s*(\w+),\s*(\w+),\s*(\w+),\s*(\w+)\s*\}/g)) {
    out.set(m[1], { seq: m[3], anim: m[4] })
  }
  return out
}

/** `BILLBOARD_ANIM_TYPE_*` */
const ANIM_LOOP = 0
const ANIM_ONESHOT = 1

/**
 * `static const BillboardAnim Unk_XXXX[] = { { 시작틱, 끝틱, 종류 }, … }`.
 *
 * 걷는 사람은 넷(북·남·서·동)이지만 바위는 하나뿐이고 전설 포켓몬은 둘이다.
 * **넷이 아닌 것을 방향으로 우기지 않는다** — 있는 만큼만 싣는다.
 */
function animTables(src) {
  const out = new Map()
  for (const m of src.matchAll(/const BillboardAnim (\w+)\[\] = \{([^}]*(?:\}[^}]*)*?)\};/g)) {
    const rows = []
    for (const r of m[2].matchAll(/\{\s*(\d+),\s*(\d+),\s*BILLBOARD_ANIM_TYPE_(\w+)\s*\}/g)) {
      if (r[3] === 'TABLE_END') break
      rows.push([Number(r[1]), Number(r[2]), r[3] === 'ONESHOT' ? ANIM_ONESHOT : ANIM_LOOP])
    }
    if (rows.length > 0) out.set(m[1], rows)
  }
  return out
}

/** `BILLBOARD_FRAME_SEQ_*` → `<이름>.bin` */
function frameSeqFiles(src) {
  return new Map(pairTable(src, 'const UnkStruct_ov5_021ED2D0 Unk_ov5_021FB5BC')
    .map(([tag, sym]) => [tag, `${sym.replace(/_bin$/, '')}.bin`]))
}

// ── 프레임 차례 파일 ─────────────────────────────────────────────────────────

/**
 * `frame_sequences/*.bin`을 푼다.
 *
 * ```
 * u32 count
 * u16 tick[count]     프레임이 시작하는 틱
 * u8  texture[count]  그때 쓸 텍스처 번호
 * u8  unused[count]
 * ```
 * 크기가 `4 + 4×count`라 count가 다른 두 파일(16·32)로 맞춰 확인된다.
 */
function frameSequence(buf) {
  const count = buf.readUInt32LE(0)
  const want = 4 + count * 4
  if (buf.length !== want) throw new Error(`프레임 차례 크기가 ${buf.length}, ${want}여야 한다`)
  const ticks = []
  const textures = []
  for (let i = 0; i < count; i++) {
    ticks.push(buf.readUInt16LE(4 + i * 2))
    textures.push(buf[4 + count * 2 + i])
  }
  return { count, ticks, textures }
}

// ── nsbtx ────────────────────────────────────────────────────────────────────

function texBlock(buf) {
  for (let i = 0, n = buf.readUInt16LE(14); i < n; i++) {
    const at = buf.readUInt32LE(16 + i * 4)
    if (buf.toString('latin1', at, at + 4) === 'TEX0') return at
  }
  return -1
}

/** 텍스처 이름이 `<밑이름>.<번호>`라 사전은 글자순이다. 번호순으로 되돌린다 */
function byFrameNumber(textures) {
  return textures
    .map((t, i) => ({ t, i, n: Number(/\.(\d+)$/.exec(t.name)?.[1] ?? 0) }))
    .sort((a, b) => a.n - b.n)
}

function main() {
  const rom = openRom()
  const files = rom.narc('/data/mmodel/mmodel.narc')
  const order = memberIndex()
  if (files.length !== order.count) {
    throw new Error(`mmodel.narc ${files.length}개 ≠ field_sprites.order ${order.count}줄`)
  }

  const src = fs.readFileSync(path.join(DECOMP, 'src/overlay005/ov5_021FAF40.c'), 'utf8')
  const ids = graphicsIds()
  const basenames = textureBasenames()
  const motion = frameSeqOf(src)
  const seqFile = frameSeqFiles(src)
  const anims = animTables(src)

  // gfx 번호 → { 파일 번호, 프레임 차례 파일, 동작표 }
  const sprites = new Map()
  for (const [gfxName, sym] of pairTable(src, 'const UnkStruct_ov5_021ED2D0 Unk_ov5_021FC9B4')) {
    const gfx = ids.get(gfxName)
    if (gfx === undefined) continue // 열매나무는 번호 공간이 다르다
    const file = `${sym.replace(/_nsbtx$/, '')}.nsbtx`
    const at = order.map.get(file)
    if (at === undefined) continue // 파수꾼 줄
    const m = motion.get(gfxName)
    sprites.set(gfx, {
      gfxName, file, at,
      seq: m === undefined ? null : seqFile.get(m.seq) ?? null,
      anim: m === undefined ? null : anims.get(m.anim) ?? null,
    })
  }

  // ── 이름 대조. 여기서 어긋나면 아래는 전부 헛것이다 ────────────────────────
  let named = 0
  const mismatch = []
  for (let i = 0; i < order.count; i++) {
    const want = basenames.get([...order.map.keys()][i])
    if (want === undefined) continue
    const at = texBlock(files[i])
    const got = at < 0 ? [] : readDict(files[i], at + files[i].readUInt16LE(at + 0x0e)).map((e) => e.name)
    if (got.length > 0 && got.every((s) => s === want || s.startsWith(`${want}.`))) named++
    else mismatch.push(`${i} ${[...order.map.keys()][i]} 기대=${want} 실제=${got.slice(0, 2)}`)
  }
  if (mismatch.length > 0) {
    throw new Error(`텍스처 이름이 ${mismatch.length}칸 어긋났다 — 표가 밀렸다\n  ${mismatch.slice(0, 5).join('\n  ')}`)
  }

  // ── 실제로 쓰이는 것만 뽑는다 ──────────────────────────────────────────────
  const events = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/events.json'), 'utf8'))
  const used = new Map()
  let placed = 0
  for (const key of Object.keys(events.events)) {
    for (const npc of events.events[key].npcs) {
      placed++
      used.set(npc.sprite, (used.get(npc.sprite) ?? 0) + 1)
    }
  }
  // 주인공은 배치표에 없다. 남녀 둘 다 필요하다
  for (const n of ['OBJ_EVENT_GFX_PLAYER_M', 'OBJ_EVENT_GFX_PLAYER_F']) {
    const id = ids.get(n)
    if (id !== undefined && !used.has(id)) used.set(id, 0)
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const manifest = {}
  const seqCache = new Map()
  let bytes = 0
  let covered = 0
  const skipped = []
  for (const [gfx, count] of [...used].sort((a, b) => a[0] - b[0])) {
    const info = sprites.get(gfx)
    if (info === undefined) { skipped.push([gfx, count]); continue }
    covered += count

    const buf = files[info.at]
    const at = texBlock(buf)
    if (at < 0) { skipped.push([gfx, count]); continue }
    const tex0 = parseTex0(buf, at)
    const frames = byFrameNumber(tex0.textures)
    const first = frames[0].t
    const pal = tex0.palettes[0]

    // 프레임을 가로로 이어 붙인 한 줄 아틀라스
    const w = first.width
    const h = first.height
    const atlas = new Uint8Array(w * frames.length * h * 4)
    for (let k = 0; k < frames.length; k++) {
      const rgba = decode(tex0, frames[k].t, pal.offset)
      for (let y = 0; y < h; y++) {
        const from = y * w * 4
        const to = (y * w * frames.length + k * w) * 4
        atlas.set(rgba.subarray(from, from + w * 4), to)
      }
    }
    const png = encodePng(atlas, w * frames.length, h)
    fs.writeFileSync(path.join(OUT_DIR, `${gfx}.png`), png)
    bytes += png.length

    // 어느 틱에 어느 장을 쓰는가. 텍스처 번호는 사전 차례라 아틀라스 차례로 옮긴다
    let seq = null
    if (info.seq !== null) {
      if (!seqCache.has(info.seq)) {
        const at2 = order.map.get(info.seq)
        const bin = at2 === undefined ? undefined : files[at2]
        seqCache.set(info.seq, bin === undefined ? null : frameSequence(bin))
      }
      const raw = seqCache.get(info.seq)
      if (raw !== null) {
        const slot = raw.textures.map((t) => frames.findIndex((f) => f.i === t))
        if (!slot.includes(-1)) seq = { ticks: raw.ticks, frames: slot }
      }
    }

    manifest[gfx] = {
      name: info.gfxName.replace(/^OBJ_EVENT_GFX_/, ''),
      w, h, frames: frames.length,
      seq,
      anims: info.anim,
      // 앞의 네 동작이 곧 북·남·서·동이다 (`constants/map_object.h`의 DIR_*).
      // 넷보다 많은 것이 있다 — 주인공은 걷기 넷 + 달리기 넷이고 간호사는 넷에
      // 인사 하나가 더 붙는다. **차례표가 있어야** 방향마다 그림이 갈린다:
      // 바위도 걷기 동작표를 달고 있지만 장이 하나뿐이라 늘 같은 그림이다
      directional: seq !== null && info.anim !== null && info.anim.length >= DIRS,
    }
  }

  const json = writeJson('npcSprites.json', manifest)
  console.log(`mmodel.narc ${files.length}칸 = field_sprites.order ${order.count}줄`)
  console.log(`텍스처 이름 대조 ${named}/${named} — 어긋남 0`)
  console.log(`배치 ${placed}건 중 ${covered}건이 그림으로 떨어진다`)
  console.log(`그림 ${Object.keys(manifest).length}벌 · PNG ${(bytes / 1024).toFixed(0)}KB · ${json.rel} ${json.kb}KB`)
  const all = Object.values(manifest)
  const kinds = new Map()
  for (const m of all) {
    const k = m.anims === null ? '동작표 없음' : `동작 ${m.anims.length}가지`
    kinds.set(k, (kinds.get(k) ?? 0) + 1)
  }
  console.log(`동작: ${[...kinds].map(([k, v]) => `${k} ${v}벌`).join(' · ')}`)
  // 차례가 없는 것은 **걷지 않는 물건**이다. 바위·나무·문처럼 한 장뿐이거나,
  // 벽화처럼 여러 장이지만 장을 고르는 쪽이 스크립트다. 걷는 차례를 달고 있어도
  // 그 표가 없는 텍스처를 가리키므로 애니메이션이 아니라는 것이 드러난다
  const still = all.filter((m) => m.seq === null)
  const many = still.filter((m) => m.frames > 1).map((m) => `${m.name}(${m.frames}장)`)
  console.log(`걷지 않는 물건 ${still.length}벌${many.length > 0 ? ` — 여러 장인 것: ${many.join(' ')}` : ''}`)
  if (skipped.length > 0) {
    console.log(`사람이 아닌 것 ${skipped.length}종 (배치 ${skipped.reduce((a, b) => a + b[1], 0)}건): ` +
      `${skipped.slice(0, 6).map(([g, c]) => `${g}×${c}`).join(' ')}…`)
  }
}

main()
