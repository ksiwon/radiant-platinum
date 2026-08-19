// 두 굽는 쪽이 갈렸는가 — 넓게 견준다 (REPAIR.md §2.2)
//
// 노드 추출기(`tools/extract/*` → `public/`)와 브라우저 변환기
// (`src/import/**` → OPFS)는 **같은 바이트**를 만들어야 한다. 한쪽만 고치면
// 개발 서버는 멀쩡하고 설치본이 깨진다.
//
// 그런데 `run.mjs`가 바이트로 견주던 것은 오래 `moves.json`·`marts.json`·
// `maps.json` 셋뿐이었다. 나머지 7,000여 개는 「만들어졌다」만 봤다.
//
// ⚠️ **그림은 바이트로 못 견준다.** deflate는 같은 픽셀에서 여러 정답을 낸다 —
// 노드 `zlib`의 `level: 9`와 브라우저 `CompressionStream`이 고르는 부호가 다르다
// (`src/import/platinum/png.ts`가 그 자리에 이 사실을 적어 두었다). 그래서
// PNG는 **펴서 픽셀로** 견준다.
//
// ⚠️ **없는 것을 「다르다」고 적지 않는다.** `public/`은 `pnpm extract`가 굽는
// 개발 산출물이라 새 기계에는 없다. 못 잰 것은 **못 잰 것으로** 세고, 통과로도
// 실패로도 안 센다 (`run.mjs`의 `sameAsNode`와 같은 규율).
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodePng } from '../shot/png.mjs'

const ROOT = resolve(import.meta.dirname, '../..')

/** OPFS의 `data/moves.json`은 `public/data/moves.json`에서 왔다 */
const nodePath = (path) => resolve(ROOT, 'public', path)

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

export const isPng = (path) => path.endsWith('.png')

/**
 * ⚠️ **GLB도 바이트로 못 견준다 — 쓰는 쪽이 아예 둘이다.** 노드는 파이썬
 * (`tools/extract/bdspGlb.py`), 브라우저는 타입스크립트(`src/import/bdsp/glb.ts`)로
 * 각자 glTF를 쓴다. JSON 청크의 열쇠 차례·빈칸·버퍼 정렬이 달라서 **같은 모델도
 * 크기가 다르다.**
 *
 * 그래서 BDSP 파리티는 처음부터 **구조**로 정의돼 있었다 — 「무대 g001이 메시
 * 158 · 정점 141,918 · 삼각형 129,589 · 재질 6까지 개발 추출기와 모두 같다」
 * (IMPORT.md §12). 여기서도 그 잣대를 쓴다
 */
export const isGlb = (path) => path.endsWith('.glb')

/** 바이트로 견줄 수 있는 것인가 */
export const byteComparable = (path) => !isPng(path) && !isGlb(path)

/**
 * **일부러 다른 것.** 여기 적힌 것만 견주기에서 빠진다.
 *
 * ⚠️ **조용히 거르지 않는다.** 이름을 대고 **왜 다른지**를 같이 적는다 —
 * 그러지 않으면 이 목록이 「자꾸 붉어지는 것을 담아 두는 서랍」이 되고, 그 순간
 * §2.2가 잡으려던 것이 여기로 숨는다.
 *
 * ⚠️ **이유가 사라지면 줄도 빠져야 한다.** 그것을 사람이 기억하지 않도록
 * `parity.test.mjs`가 **이유가 아직 참인지**를 산출물에서 직접 잰다
 */
export const KNOWN_DIFFERENT = new Map([
  ['data/dialogue/index.json',
    '노드는 골라 실은 뱅크와 개발 기계에 있는 세 판을 적고, 브라우저는 뱅크를 '
    + '다 만들고 **설치한 한 판만** 적는다 — 목차가 같으면 오히려 하나를 '
    + '빠뜨린 것이다 (`src/import/platinum/text.test.ts`가 같은 이유로 이 파일을 '
    + '건너뛴다). 알맹이(뱅크 파일)는 겹치는 것끼리 다 견준다'],
])

/** 노드 파일의 바이트 수. 없으면 null */
export function nodeSize(path) {
  try { return statSync(nodePath(path)).size } catch { return null }
}

/** 노드 파일을 바이트로 해싱. 없으면 null */
export function nodeSha(path) {
  try { return sha256(readFileSync(nodePath(path))) } catch { return null }
}

/**
 * 그림 둘을 **픽셀로** 견준다.
 *
 * ⚠️ **펴는 자는 하나다.** 브라우저는 대표 그림의 **바이트만** 실어 보내고
 * (`fixtures.mjs`의 `readInstalledGroups`), 양쪽 다 여기서 `decodePng` 하나로
 * 편다. 페이지 안에서 한 벌 더 펴게 했더니 자가 둘이 됐고 — 어긋나면 멀쩡한
 * 변환기가 붉어진다 — 정본 CSP에 `unsafe-eval`이 없어 그 길은 막히기도 했다.
 *
 * @returns 같으면 `{ok: true}` · 다르면 다른 픽셀 수 · 못 재면 `null`
 */
export function comparePixels(path, png) {
  let theirs
  try { theirs = decodePng(readFileSync(nodePath(path))) } catch { return null }
  let mine
  try { mine = decodePng(Buffer.from(png, 'base64')) } catch (e) {
    return { ok: false, why: `브라우저 그림을 못 폈다: ${String(e.message ?? e)}` }
  }
  if (mine.w !== theirs.w || mine.h !== theirs.h) {
    return { ok: false, why: `크기가 다르다 ${mine.w}×${mine.h} ≠ ${theirs.w}×${theirs.h}` }
  }
  let bad = 0
  for (let i = 0; i < theirs.pixels.length; i++) {
    if (mine.pixels[i] !== theirs.pixels[i]) bad++
  }
  return bad === 0 ? { ok: true } : { ok: false, why: `픽셀 ${String(bad)}개가 다르다` }
}

/**
 * 브라우저가 만든 해시 목록을 노드 산출물과 견준다.
 *
 * @param sha  `{경로: sha256}` — 브라우저가 잰 **바이트** 해시
 * @returns 잰 것 · 같은 것 · 다른 것 · 못 잰 것
 */
export function compareBytes(sha) {
  const same = []
  const differ = []
  const noNode = []
  const skipped = []
  const known = []
  for (const [path, got] of Object.entries(sha)) {
    // 그림과 모델은 여기서 안 본다 — 쓰는 쪽이 달라도 알맹이는 같을 수 있다
    if (!byteComparable(path)) { skipped.push(path); continue }
    if (KNOWN_DIFFERENT.has(path)) { known.push(path); continue }
    const want = nodeSha(path)
    if (want === null) { noNode.push(path); continue }
    if (want === got) same.push(path)
    else differ.push({ path, got, want, nodeBytes: nodeSize(path) })
  }
  return { same, differ, noNode, skipped, known }
}

/**
 * 그룹마다 **개수와 총 바이트**를 견준다.
 *
 * 전부 대조는 비싸므로 이것이 넓은 그물이다 — 파일 하나가 빠지거나 크기가
 * 어긋나면 여기서 걸린다.
 *
 * ⚠️ **그림의 바이트는 안 더한다.** 압축 부호가 달라 크기도 다르다 — 그 몫을
 * 섞으면 총 바이트가 늘 어긋나서 이 자가 쓸모없어진다. 그림은 **개수만** 센다
 *
 * @param groups `{그룹: {files, bytes, paths}}` — 브라우저 설치 목차에서 온 것
 */
export function compareGroups(groups) {
  const rows = []
  for (const [name, g] of Object.entries(groups)) {
    let nodeFiles = 0
    let nodeBytes = 0
    let mineBytes = 0
    let missing = 0
    let sized = 0
    let known = 0
    const off = []
    for (const [path, bytes] of g.paths) {
      if (KNOWN_DIFFERENT.has(path)) { known++; continue }
      const size = nodeSize(path)
      if (size === null) { missing++; continue }
      nodeFiles++
      if (!byteComparable(path)) continue
      nodeBytes += size
      mineBytes += bytes
      sized++
      // ⚠️ **어긋난 것은 개수만 세지 말고 이름을 남긴다.** 「1개」만 적히면
      // 어디를 봐야 하는지 몰라 다시 몰아야 한다 — 그 한 번이 몇십 분이다
      if (size !== bytes) off.push({ path, mine: bytes, node: size })
    }
    rows.push({
      group: name,
      files: g.files, nodeFiles, missing,
      sized, known, mineBytes, nodeBytes, mismatched: off.length, off,
    })
  }
  return rows
}

/**
 * 그룹마다 대표 한 파일씩 — 그림은 픽셀로, 나머지는 바이트로.
 *
 * @param reps `{그룹: {byte: {path, sha}|null, pixel: {path, sha}|null}}`
 */
export function compareReps(reps) {
  const ok = []
  const bad = []
  const noNode = []
  for (const [name, rep] of Object.entries(reps)) {
    if (rep.byte) {
      const want = nodeSha(rep.byte.path)
      if (want === null) noNode.push(`${name}:${rep.byte.path}`)
      else if (want === rep.byte.sha) ok.push(`${name}:${rep.byte.path}`)
      else bad.push(`${name} ${rep.byte.path} (바이트)`)
    }
    // 상한을 넘어 안 실어 온 것은 **못 잰 것**이지 통과가 아니다
    for (const [kind, r, how, cmp] of [
      ['png', rep.pixel, '픽셀', comparePixels],
      ['glb', rep.model, '구조', compareGlb],
    ]) {
      if (!r) continue
      if (r[kind] === undefined) { noNode.push(`${name}:${r.path}`); continue }
      const got = cmp(r.path, r[kind])
      if (got === null) noNode.push(`${name}:${r.path}`)
      else if (got.ok) ok.push(`${name}:${r.path}`)
      else bad.push(`${name} ${r.path} (${how} — ${got.why})`)
    }
  }
  return { ok, bad, noNode }
}

/**
 * glTF 둘을 **구조로** 견준다 — 메시 · 정점 · 삼각형 · 재질 · 노드 · 애니 이름.
 *
 * ⚠️ **바이트가 아니라 이것이 BDSP의 파리티 정의다** (IMPORT.md §12). 그림에서
 * 픽셀을 보는 것과 같은 자리다 — 쓰는 쪽이 둘이라 부호는 다르고 알맹이는 같아야
 * 한다
 */
export function compareGlb(path, glb) {
  const readGltf = (buf) => {
    if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('GLB가 아니다')
    const len = buf.readUInt32LE(12)
    if (buf.toString('latin1', 16, 20) !== 'JSON') throw new Error('첫 청크가 JSON이 아니다')
    return JSON.parse(buf.toString('utf8', 20, 20 + len))
  }
  /** 견줄 잣대 — 이름과 수만 본다. 부동소수 하나까지 맞추라는 뜻이 아니다 */
  const shape = (g) => ({
    meshes: (g.meshes ?? []).length,
    prims: (g.meshes ?? []).reduce((n, m) => n + (m.primitives ?? []).length, 0),
    verts: (g.accessors ?? []).filter((a) => a.type === 'VEC3').reduce((n, a) => n + a.count, 0),
    tris: (g.accessors ?? []).filter((a) => a.type === 'SCALAR').reduce((n, a) => n + a.count, 0),
    materials: (g.materials ?? []).length,
    nodes: (g.nodes ?? []).length,
    images: (g.images ?? []).length,
    skins: (g.skins ?? []).length,
    anims: (g.animations ?? []).map((a) => a.name ?? '').sort(),
  })
  let theirs
  try { theirs = shape(readGltf(readFileSync(nodePath(path)))) } catch { return null }
  let mine
  try { mine = shape(readGltf(Buffer.from(glb, 'base64'))) } catch (e) {
    return { ok: false, why: `브라우저 glb를 못 읽었다: ${String(e.message ?? e)}` }
  }
  const off = []
  for (const key of Object.keys(theirs)) {
    const a = JSON.stringify(mine[key])
    const b = JSON.stringify(theirs[key])
    if (a !== b) off.push(`${key} ${a} ≠ ${b}`)
  }
  return off.length === 0 ? { ok: true } : { ok: false, why: off.slice(0, 4).join(' · ') }
}

/** 표를 한 줄로. 못 잰 것을 잰 것처럼 안 적는다 */
export function saySpread(rows) {
  const files = rows.reduce((s, r) => s + r.files, 0)
  const missing = rows.reduce((s, r) => s + r.missing, 0)
  const mismatched = rows.reduce((s, r) => s + r.mismatched, 0)
  const sized = rows.reduce((s, r) => s + r.sized, 0)
  const known = rows.reduce((s, r) => s + r.known, 0)
  return `그룹 ${String(rows.length)}개 · 파일 ${files.toLocaleString()}개 중 `
    + `${sized.toLocaleString()}개를 크기로 견줬다 (어긋남 ${String(mismatched)}) · `
    + `노드에 없어 못 잼 ${String(missing)} · 일부러 다른 것 ${String(known)}`
}

/**
 * 크기가 어긋난 JSON 하나를 **열쇠로** 견준다 — 무엇이 늘고 무엇이 빠졌나.
 *
 * @param text 브라우저가 만든 알맹이 (`fixtures.mjs`의 `readFiles`)
 */
export function sayJsonDiff(path, text) {
  if (typeof text !== 'string') return '알맹이를 못 읽었다'
  let mine
  let theirs
  try {
    mine = JSON.parse(text)
    theirs = JSON.parse(readFileSync(nodePath(path), 'utf8'))
  } catch { return 'JSON이 아니라 열쇠로는 못 견준다' }
  if (Array.isArray(mine) || Array.isArray(theirs) || typeof mine !== 'object') {
    return `길이 ${String(mine?.length ?? '?')} ≠ ${String(theirs?.length ?? '?')}`
  }
  const a = Object.keys(mine)
  const b = new Set(Object.keys(theirs))
  const added = a.filter((k) => !b.has(k))
  const gone = [...b].filter((k) => !a.includes(k))
  const changed = a.filter((k) => b.has(k) && JSON.stringify(mine[k]) !== JSON.stringify(theirs[k]))
  const say = (label, list) => (list.length === 0 ? '' : ` ${label} ${String(list.length)}개(${
    list.slice(0, 6).map((k) => `${k}=${JSON.stringify(mine[k] ?? theirs[k])}`).join(' ')})`)
  return `열쇠 ${String(a.length)} ≠ ${String(b.size)} —${say('브라우저에만', added)}${
    say('노드에만', gone)}${say('값이 다름', changed)}`.trim()
}
