'use strict'
// 디컴프 표 셋 → src/import/platinum/spriteTable.ts (DATA.md §2.16)
//
//     pnpm gen:spriteTable
//
// ⚠️ **왜 소스에 굽는가.** 오버월드 그림 번호에서 `mmodel.narc` 파일 번호로 가는
// 길은 산술이 아니라 **찾아보기 표 셋**이고, 그 셋은 전부 디컴프에 있다 —
// 롬에는 없다. 공개 Importer는 사용자의 롬만 받으므로 그 표를 브라우저가 들고
// 있어야 한다. `charmap`·`scriptMeta`와 같은 자리다.
//
// ⚠️ **여기 담기는 것은 표지 게임 자료가 아니다.** 이름표(`LASS`)와 색인 번호와
// 틱 숫자뿐이고, 그림·글·소리는 한 바이트도 없다 (COPYRIGHT.md §2).
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('fs')
const path = require('path')

const { ROOT } = require('../raw/sources.cjs')
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')
const SPRITES = path.join(DECOMP, 'res/graphics/field_sprites')
const OUT = path.join(ROOT, 'src/import/platinum/spriteTable.ts')

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

/** gfx 이름 → { 프레임 차례 태그, 동작표 심볼 } (`Unk_ov5_021FD77C`의 셋째·넷째 칸) */
function frameSeqOf(src) {
  const body = src.split('Unk_ov5_021FD77C[] = {')[1].split('};')[0]
  const out = new Map()
  for (const m of body.matchAll(/\{\s*(\w+),\s*(\w+),\s*(\w+),\s*(\w+)\s*\}/g)) {
    out.set(m[1], { seq: m[3], anim: m[4] })
  }
  return out
}

const ANIM_LOOP = 0
const ANIM_ONESHOT = 1

/** `static const BillboardAnim Unk_XXXX[] = { { 시작틱, 끝틱, 종류 }, … }` */
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

function main() {
  const src = fs.readFileSync(path.join(DECOMP, 'src/overlay005/ov5_021FAF40.c'), 'utf8')
  const ids = graphicsIds()
  const order = memberIndex()
  const basenames = textureBasenames()
  const motion = frameSeqOf(src)
  const seqFile = frameSeqFiles(src)
  const anims = animTables(src)
  const files = [...order.map.keys()]

  const rows = []
  for (const [gfxName, sym] of pairTable(src, 'const UnkStruct_ov5_021ED2D0 Unk_ov5_021FC9B4')) {
    const gfx = ids.get(gfxName)
    if (gfx === undefined) continue // 열매나무는 번호 공간이 다르다
    const file = `${sym.replace(/_nsbtx$/, '')}.nsbtx`
    const at = order.map.get(file)
    if (at === undefined) continue // 파수꾼 줄
    const m = motion.get(gfxName)
    const seqName = m === undefined ? null : seqFile.get(m.seq) ?? null
    const seqAt = seqName === null ? undefined : order.map.get(seqName)
    rows.push({
      id: gfx,
      name: gfxName.replace(/^OBJ_EVENT_GFX_/, ''),
      member: at,
      seq: seqAt === undefined ? null : seqAt,
      anims: (m === undefined ? null : anims.get(m.anim) ?? null),
      // 롬에서 꺼낸 텍스처 이름과 맞대 보는 자물쇠. 브라우저 변환기가 이걸로
      // 표가 밀렸는지 확인한다 — 밀린 채로 구우면 엉뚱한 사람이 선다
      texture: basenames.get(file) ?? null,
    })
  }
  rows.sort((a, b) => a.id - b.id)

  const body = rows.map((r) => {
    const anims = r.anims === null ? 'null' : `[${r.anims.map((a) => `[${a.join(',')}]`).join(',')}]`
    return `  [${r.id}, ${JSON.stringify(r.name)}, ${r.member}, ${r.seq === null ? 'null' : r.seq}, `
      + `${anims}, ${r.texture === null ? 'null' : JSON.stringify(r.texture)}],`
  }).join('\n')

  const out = `// 오버월드 그림 표 — 그림 번호 → mmodel 멤버 (DATA.md §2.16)
//
// ⚠️ **손으로 고치지 않는다.** \`pnpm gen:spriteTable\`이 디컴프에서 다시 만든다
// (\`tools/extract/spriteTableModule.cjs\`).
//
// 그림 번호에서 \`mmodel.narc\` 파일 번호로 가는 길은 산술이 아니라 찾아보기 표
// 셋이다 (\`generated/object_events_gfx.txt\` → \`Unk_ov5_021FC9B4\` →
// \`field_sprites.order\`). 그 셋은 디컴프에만 있고 롬에는 없어서, 공개 Importer가
// 쓸 수 있도록 여기 구워 둔다. **표지 게임 자료가 아니다** — 이름표와 색인 번호와
// 틱 숫자뿐이다 (COPYRIGHT.md §2).

/** \`[시작 틱, 끝 틱, 0=되풀이 1=한 번]\` */
export type BillboardAnim = readonly [number, number, number]

/** \`[그림 번호, 이름표, mmodel 멤버, 프레임 차례 멤버, 동작표, nsbtx 텍스처 이름]\` */
export type SpriteRow = readonly [
  number, string, number, number | null, readonly BillboardAnim[] | null, string | null,
]

export const SPRITE_TABLE: readonly SpriteRow[] = [
${body}
]

/** 그림 번호 → 이름표. BDSP 인물과 잇는 재료다 (\`engine/actor/npcModels\`) */
export const SPRITE_NAMES: Readonly<Record<number, string>> =
  Object.fromEntries(SPRITE_TABLE.map((r) => [r[0], r[1]]))
`
  fs.writeFileSync(OUT, out)
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1)
  console.log(`그림 ${rows.length}종 · mmodel ${order.count}칸 · 이름 붙은 nsbtx ${basenames.size}개`)
  console.log(`  → ${path.relative(ROOT, OUT)} (${kb}KB)`)
  const missing = rows.filter((r) => r.texture === null).length
  if (missing > 0) console.log(`  텍스처 이름이 없는 줄 ${missing}개 (meson.build에 안 적힌 것)`)
  void files
}

main()
