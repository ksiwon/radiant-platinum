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

/**
 * **깨어진 세계에만 서는 사람들.**
 *
 * ⚠️ 그 층의 사람과 바위는 맵 헤더의 배치표(`events.narc`)가 아니라 `tw_arc`의
 * 제 표에 들어 있다 (`sMapObjectEvents`). 배치표만 훑으면 이 다섯이 통째로
 * 빠져서 **세워도 아무것도 안 그려진다** — 기라티나가 그래서 안 보였다.
 * 시로나·태홍·바위·호수 셋의 보통 그림은 다른 맵에도 서므로 이미 들어온다
 */
const DIST_WORLD_ONLY = [
  'OBJ_EVENT_GFX_GIRATINA_ORIGIN',
  'OBJ_EVENT_GFX_DIST_WORLD_B1F_MESPRIT',
  'OBJ_EVENT_GFX_DIST_WORLD_B6F_UXIE',
  'OBJ_EVENT_GFX_DIST_WORLD_B6F_MESPRIT',
  'OBJ_EVENT_GFX_DIST_WORLD_B6F_AZELF',
]

/** 「그림이 없다」 (`OBJ_EVENT_GFX_NONE`). 보이지 않는 판정용 객체가 쓴다 */
const NO_GRAPHICS = 8192

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
  addBerryIds(out)
  return out
}

/**
 * 나무열매 밭의 그림 번호 193개 (`constants/berry_tree_obj_event_gfx.h`).
 *
 * ⚠️ **여기만 열거형이 아니라 산술이다.** `OBJ_EVENT_GFX_BERRY_SPROUT`(4096)에서
 * `열매 번호 × 3 + 단계`를 더한다 — 1 자람 · 2 꽃 · 3 열림. 그래서
 * `object_events_gfx.txt`에는 싹 하나만 있고 나머지 192개가 안 나온다
 */
function addBerryIds(out) {
  const base = out.get('OBJ_EVENT_GFX_BERRY_SPROUT')
  if (base === undefined) throw new Error('OBJ_EVENT_GFX_BERRY_SPROUT를 못 찾았다')

  const items = new Map()
  let next = 0
  for (const line of fs.readFileSync(
    path.join(DECOMP, 'generated/items.txt'), 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (t === '') continue
    items.set(t, next)
    next++
  }
  const firstBerry = items.get('ITEM_CHERI_BERRY')
  if (firstBerry === undefined) throw new Error('ITEM_CHERI_BERRY를 못 찾았다')

  const src = fs.readFileSync(
    path.join(DECOMP, 'include/constants/berry_tree_obj_event_gfx.h'), 'utf8')
  const re = /#define (OBJ_EVENT_GRAPHICS_\w+)\s+\(OBJ_EVENT_GFX_BERRY_SPROUT \+ BERRY_ID\((\w+)\) \* 3 \+ (\d)\)/g
  let found = 0
  for (const m of src.matchAll(re)) {
    const item = items.get(`ITEM_${m[2]}_BERRY`)
    if (item === undefined) throw new Error(`모르는 열매: ${m[2]}`)
    out.set(m[1], base + (item - firstBerry) * 3 + Number(m[3]))
    found++
  }
  if (found !== 64 * 3) throw new Error(`열매 그림이 ${found}개다 — 192여야 한다`)
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
    if (gfx === undefined) continue // 파수꾼 등 표 밖의 이름
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
  // 나무열매 밭 그림 193개도 배치표에 없다 (PARITY §4.6) — 배치되는 것은
  // 흙(100번) 하나고 그 위의 싹·자람·꽃·열매는 자란 정도에 따라 코드가 갈아
  // 끼운다. 번호는 싹 4096에서 열매마다 셋씩이다
  for (let gfx = 4096; gfx <= 4096 + 64 * 3; gfx++) {
    if (sprites.has(gfx) && !used.has(gfx)) used.set(gfx, 0)
  }
  // 깨어진 세계 사람들도 배치표에 없다 (`DIST_WORLD_ONLY`)
  for (const n of DIST_WORLD_ONLY) {
    const id = ids.get(n)
    if (id !== undefined && !used.has(id)) used.set(id, 0)
  }
  // ⚠️ **그 목록이 자료와 맞는지 여기서 못 박는다.** 늘리기만 하고 확인을
  // 안 하면 나중에 한 종이 늘었을 때 조용히 안 보이는 사람이 생긴다
  const dwFile = path.join(ROOT, 'public/data/distortion.json')
  if (fs.existsSync(dwFile)) {
    const dw = JSON.parse(fs.readFileSync(dwFile, 'utf8'))
    const miss = new Set()
    for (const table of dw.mapObjects ?? []) {
      for (const row of table.objects) {
        if (row.graphicsID === NO_GRAPHICS || used.has(row.graphicsID)) continue
        miss.add(row.graphicsID)
      }
    }
    if (miss.size > 0) {
      throw new Error(`깨어진 세계가 쓰는데 목록에 없는 그림: ${[...miss].join(' ')}`)
    }
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
      name: info.gfxName.replace(/^OBJ_EVENT_(GFX|GRAPHICS)_/, ''),
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

  const hide = disguises(rom)
  fs.writeFileSync(path.join(OUT_DIR, 'disguise.png'), hide.png)

  const json = writeJson('npcSprites.json', manifest)
  console.log(`변장 더미 ${hide.count}장 · ${hide.size}×${hide.size}`)
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

/**
 * 변장한 트레이너가 쓰고 있는 더미 넷 (PARITY §1.15).
 *
 * `Unk_ov5_02200678`이 적어 둔 `fldeff.narc` 멤버 넷을 그 차례로 읽는다 —
 * **눈 · 모래 · 바위 · 풀**이고 이동 유형 51~54와 같은 차례다.
 *
 * ⚠️ **모델을 안 굽는다.** 넷 다 꼭짓점 넷·삼각형 둘짜리 **한 칸 크기의 평면**
 * 하나가 전부고(y = 0.1875, 앞뒤 양면) 그 값을 롬에서 실측했다. 껍데기가
 * 고정이라 남는 것은 16×16 그림 넷뿐이다.
 *
 * ⚠️ **브라우저 쪽(`src/import/platinum/npcSprites.ts`)과 한 줄씩 같아야 한다.**
 */
function disguises(rom) {
  const narc = rom.narc('/data/mmodel/fldeff.narc')
  const members = [103, 104, 105, 106]
  const sheets = []
  let size = 0
  for (const member of members) {
    const buf = narc[member]
    const tex0 = parseTex0(buf, texBlock(buf))
    const tex = tex0.textures[0]
    const pal = tex0.palettes[0]
    if (size === 0) size = tex.width
    if (tex.width !== size || tex.height !== size) {
      throw new Error(`변장 더미 ${member}가 ${tex.width}×${tex.height}다 — 표가 밀렸다`)
    }
    sheets.push(decode(tex0, tex, pal.offset))
  }
  const strip = new Uint8Array(size * sheets.length * size * 4)
  for (let k = 0; k < sheets.length; k++) {
    for (let y = 0; y < size; y++) {
      const from = y * size * 4
      strip.set(sheets[k].subarray(from, from + size * 4), (y * size * sheets.length + k * size) * 4)
    }
  }
  return { png: encodePng(strip, size * sheets.length, size), count: sheets.length, size }
}
