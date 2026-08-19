// 넓게 견주는 자가 스스로 어긋나지 않는가 (REPAIR.md §2.2)
//
// ⚠️ **자를 둘 두면 안 된다는 규율이 이 시험의 이유다.** 한때 그림을 펴는 법이
// 두 군데였다 — 노드 `tools/shot/png.mjs`의 `decodePng`과 페이지 안의 사본.
// 둘이 어긋나면 **멀쩡한 변환기가 「픽셀이 다르다」로 떨어진다.** 그러면 §2.2가
// 잡으려던 것과 정반대로, 아무 문제 없는 자리를 붉게 만들어 놓고 원인을
// 변환기에서 찾게 된다. (게다가 정본 CSP에 `unsafe-eval`이 없어 페이지 쪽
// 사본을 소스로 세우는 길은 애초에 막힌다.)
//
// 그래서 브라우저는 대표 그림의 **바이트만** 보내고 펴는 일은 노드가 한다.
// 여기서 재는 것은 그 길이 실제 산출물에서 도는가다 — 없는 기계에서는 스스로
// 건너뛴다.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  byteComparable, compareBytes, compareGlb, compareGroups, comparePixels, compareReps,
  isGlb, isPng, KNOWN_DIFFERENT, nodeSha, saySpread,
} from './parity.mjs'

const ROOT = resolve(import.meta.dirname, '../..')

/** 산출물에서 그림 몇 장. 없으면 빈 배열이라 아래 시험이 건너뛴다 */
const somePngs = (() => {
  const out = []
  for (const dir of ['data/pokemon', 'data/trainers', 'data/npc', 'data/tex']) {
    const at = resolve(ROOT, 'public', dir)
    if (!existsSync(at)) continue
    const hit = readdirSync(at).filter((f) => f.endsWith('.png')).sort().slice(0, 3)
    for (const f of hit) out.push(`${dir}/${f}`)
  }
  return out
})()

const asBase64 = (rel) => readFileSync(resolve(ROOT, 'public', rel)).toString('base64')

describe('그림을 픽셀로 견주는 자', () => {
  it.skipIf(somePngs.length === 0)('같은 그림이면 같다고 한다', () => {
    for (const rel of somePngs) {
      expect(comparePixels(rel, asBase64(rel)), rel).toEqual({ ok: true })
    }
  })

  // ⚠️ **압축 부호가 달라도 픽셀이 같으면 같다.** 이게 이 축이 있는 이유다 —
  // 노드 `zlib`의 `level: 9`와 브라우저 `CompressionStream`이 다른 부호를 낸다
  it.skipIf(somePngs.length === 0)('바이트가 달라도 픽셀이 같으면 같다', () => {
    const rel = somePngs[0]
    const bytes = readFileSync(resolve(ROOT, 'public', rel))
    // 같은 파일 뒤에 주석 청크 하나를 붙인다 — 픽셀은 그대로고 바이트만 갈린다
    const tail = Buffer.from([0, 0, 0, 0, 0x74, 0x45, 0x58, 0x74, 0, 0, 0, 0])
    const at = bytes.length - 12
    const grown = Buffer.concat([bytes.subarray(0, at), tail, bytes.subarray(at)])
    expect(grown.length).not.toBe(bytes.length)
    expect(comparePixels(rel, grown.toString('base64'))).toEqual({ ok: true })
  })

  it.skipIf(somePngs.length < 2)('다른 그림이면 다르다고 한다', () => {
    const got = comparePixels(somePngs[0], asBase64(somePngs[1]))
    expect(got.ok).toBe(false)
    expect(got.why).toMatch(/픽셀|크기/)
  })

  it('못 펴는 것을 조용히 통과시키지 않는다', () => {
    const rel = somePngs[0]
    if (rel === undefined) return
    const got = comparePixels(rel, Buffer.from('이건 PNG가 아니다').toString('base64'))
    expect(got.ok).toBe(false)
  })
})

const someGlb = (() => {
  for (const dir of ['models/npc', 'models/pokemon', 'models/arena']) {
    const at = resolve(ROOT, 'public', dir)
    if (!existsSync(at)) continue
    const hit = readdirSync(at).filter((f) => f.endsWith('.glb')).sort()
    if (hit.length > 1) return [`${dir}/${hit[0]}`, `${dir}/${hit[1]}`]
  }
  return []
})()

// ⚠️ **모델은 쓰는 쪽이 아예 둘이다** — 노드는 파이썬, 브라우저는 타입스크립트.
// 그래서 바이트가 아니라 구조로 견준다 (IMPORT.md §12가 BDSP 파리티를 그렇게
// 정의해 뒀다)
describe('모델을 구조로 견주는 자', () => {
  it('바이트로는 안 견준다', () => {
    expect(byteComparable('models/npc/fc0001_00.glb')).toBe(false)
    expect(byteComparable('data/pokemon/000.png')).toBe(false)
    expect(byteComparable('data/moves.json')).toBe(true)
    expect(isGlb('models/npc/fc0001_00.glb')).toBe(true)
  })

  it.skipIf(someGlb.length === 0)('같은 모델이면 같다고 한다', () => {
    const bytes = readFileSync(resolve(ROOT, 'public', someGlb[0]))
    expect(compareGlb(someGlb[0], bytes.toString('base64'))).toEqual({ ok: true })
  })

  it.skipIf(someGlb.length < 2)('다른 모델이면 어느 축이 다른지 적는다', () => {
    const other = readFileSync(resolve(ROOT, 'public', someGlb[1]))
    const got = compareGlb(someGlb[0], other.toString('base64'))
    expect(got.ok).toBe(false)
    expect(got.why).toMatch(/meshes|verts|tris|materials|nodes|anims|images|skins|prims/)
  })

  it('못 읽는 것을 조용히 통과시키지 않는다', () => {
    if (someGlb.length === 0) return
    const got = compareGlb(someGlb[0], Buffer.from('이건 GLB가 아니다').toString('base64'))
    expect(got.ok).toBe(false)
  })
})

describe('견주는 규율', () => {
  // ⚠️ **없는 것을 「다르다」고 적으면 앱의 실패로 읽힌다.** `public/`은
  // `pnpm extract`가 굽는 개발 산출물이라 새 기계에는 없다
  it('노드에 없는 파일은 다름이 아니라 못 잼이다', () => {
    const got = compareBytes({ 'data/이런것은없다.json': 'ff'.repeat(32) })
    expect(got.differ).toEqual([])
    expect(got.noNode).toEqual(['data/이런것은없다.json'])
  })

  // ⚠️ **그림은 바이트로 견주면 늘 어긋난다** — deflate가 같은 픽셀에서 여러
  // 정답을 낸다 (`src/import/platinum/png.ts`). 바이트 축에서는 빼고 센다
  it('그림은 바이트 축에서 빠진다', () => {
    const got = compareBytes({ 'data/pokemon/000.png': 'ff'.repeat(32) })
    expect(got.differ).toEqual([])
    expect(got.skipped).toEqual(['data/pokemon/000.png'])
    expect(isPng('data/pokemon/000.png')).toBe(true)
  })

  it('바이트가 다르면 다르다고 적는다', () => {
    const real = ['data/moves.json', 'data/maps.json'].find((p) => nodeSha(p) !== null)
    if (real === undefined) return
    expect(compareBytes({ [real]: nodeSha(real) }).same).toEqual([real])
    expect(compareBytes({ [real]: '00'.repeat(32) }).differ).toHaveLength(1)
  })

  // 그룹 축도 같은 규율이다 — 노드에 없는 것은 `missing`이지 `mismatched`가 아니다
  it('그룹 축에서도 없는 것과 어긋난 것을 가른다', () => {
    const rows = compareGroups({
      없는것: { files: 1, bytes: 9, paths: [['data/이런것은없다.json', 9]] },
    })
    expect(rows[0].missing).toBe(1)
    expect(rows[0].mismatched).toBe(0)
    expect(rows[0].sized).toBe(0)
    expect(saySpread(rows)).toContain('못 잼 1')
  })

  it('대표가 노드에 없으면 통과로도 실패로도 안 센다', () => {
    const got = compareReps({
      어떤그룹: { byte: { path: 'data/이런것은없다.json', sha: 'x' }, pixel: null },
    })
    expect(got.ok).toEqual([])
    expect(got.bad).toEqual([])
    expect(got.noNode).toEqual(['어떤그룹:data/이런것은없다.json'])
  })

  // ⚠️ **상한을 넘어 안 실어 온 그림은 못 잰 것이지 통과가 아니다**
  it('너무 커서 안 실어 온 그림은 못 잼이다', () => {
    const got = compareReps({
      큰그룹: { byte: null, pixel: { path: 'data/tex/큰것.png', tooBig: 99 } },
    })
    expect(got.ok).toEqual([])
    expect(got.bad).toEqual([])
    expect(got.noNode).toEqual(['큰그룹:data/tex/큰것.png'])
  })
})

// ⚠️ **거르기로 한 목록은 이유가 사라져도 안 없어진다** — 사람이 지워야 하는데
// 지울 계기가 없기 때문이다. 그래서 **이유가 아직 참인지**를 산출물에서 직접
// 잰다. 참이 아니게 되면 이 시험이 서고, 그때 목록에서 줄을 뺀다
describe('일부러 다른 것', () => {
  it('이유를 안 적은 줄이 없다', () => {
    for (const [path, why] of KNOWN_DIFFERENT) {
      expect(why, path).toBeTruthy()
      expect(why.length, path).toBeGreaterThan(30)
    }
  })

  const index = resolve(ROOT, 'public/data/dialogue/index.json')
  it.skipIf(!existsSync(index))('대사 목차는 아직 노드와 브라우저가 다르다', () => {
    const got = JSON.parse(readFileSync(index, 'utf8'))
    // 브라우저는 뱅크를 **다 만들고**(724) **설치한 한 판만** 적는다.
    // 노드가 그 둘 다 하게 되면 이 줄은 목록에서 빠져야 한다
    const sameAsBrowser = got.banks.length === 724 && got.locales.length === 1
    expect(sameAsBrowser, `노드 목차가 뱅크 ${got.banks.length}개 · 판 ${got.locales.length}개다`
      + ' — 브라우저와 같아졌으면 KNOWN_DIFFERENT에서 이 줄을 뺀다').toBe(false)
    expect(KNOWN_DIFFERENT.has('data/dialogue/index.json')).toBe(true)
  })
})
