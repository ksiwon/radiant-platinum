// 그림을 못 찾은 서브메시가 있는가.
//
// 못 찾으면 `MISSING`(자홍색)으로 그린다 — 눈에 띄라고 그렇게 둔 것인데,
// 무쇠시티 프렌들리숍 문틀에 실제로 **자홍색 선**이 그어져 있었다. 원인은
// 빠진 그림이 아니라 **그림이 애초에 없는 서브메시**였다(`tex: null`).
// 원작 DS는 텍스처 없이 정점 색만으로 그리는 폴리곤을 쓴다.
//
// 그래서 둘을 갈라 못박는다: 진짜로 못 찾는 것은 0개여야 하고, 그림 없는
// 것은 정점 색으로 그린다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const DATA = resolve(__dirname, '../../public/data')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8')) as unknown

interface Meta {
  materials: { tex: string | null; pal: string | null }[]
  submeshes: [number, number, number][]
}

/** 청크·소품 파일 머리의 JSON만 읽는다. 정점은 안 본다 */
function metaOf(path: string): Meta {
  const buf = readFileSync(resolve(DATA, path))
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const len = view.getUint32(4, true)
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf.buffer, buf.byteOffset + 8, len)),
  ) as Meta
}

type Sheet = { items: [string, string, number, number, number, number][] } | null

function counts(metas: Meta[], sheets: (index: number) => Sheet, keyOf: (i: number) => number) {
  let total = 0
  let noTexture = 0
  const unmatched: string[] = []
  metas.forEach((m, i) => {
    const sheet = sheets(keyOf(i))
    for (const [mat] of m.submeshes) {
      const spec = m.materials[mat]!
      total++
      if (spec.tex === null) { noTexture++; continue }
      const hit = sheet?.items.some(([tex, pal]) => tex === spec.tex && pal === (spec.pal ?? ''))
      if (hit !== true) unmatched.push(`${spec.tex}/${spec.pal ?? ''}`)
    }
  })
  return { total, noTexture, unmatched }
}

describe('그림 붙이기', () => {
  it('오버월드 소품은 두 개만 그림이 없고, 못 찾는 것은 하나도 없다', () => {
    const props = read('props/index.json') as { sheets: Sheet[] }
    const matrix = read('matrices/0.json') as {
      buildings: Record<string, { model: number }[]>
    }
    const models = [...new Set(
      Object.values(matrix.buildings).flat().map((b) => b.model),
    )].sort((a, b) => a - b)

    const metas = models.map((id) => metaOf(`props/${String(id)}.bin`))
    const { total, noTexture, unmatched } = counts(
      metas, (i) => props.sheets[i] ?? null, (i) => models[i]!)

    expect(total).toBe(442)
    // `tex: null` 둘. 정점 색으로 그린다 — 자홍색으로 돌리면 안 된다
    expect(noTexture).toBe(2)
    expect(unmatched, `못 찾은 그림: ${[...new Set(unmatched)].join(' ')}`).toHaveLength(0)
  })

  it('오버월드 청크는 전부 제 그림을 찾는다', () => {
    const tex = read('tex/index.json') as { sets: Sheet[] }
    const matrix = read('matrices/0.json') as { chunks: { land: number }[] }
    const maps = read('maps.json') as {
      maps: { matrix: number; area: number }[]
      areas: { tex: number }[]
    }
    // 오버월드 맵이 쓰는 텍스처 묶음 전부. 청크는 영역마다 다른 묶음으로 칠해진다
    const sets = [...new Set(maps.maps
      .filter((m) => m.matrix === 0)
      .map((m) => maps.areas[m.area]?.tex)
      .filter((t): t is number => t !== undefined))]

    const lands = [...new Set(matrix.chunks.map((c) => c.land))]
    let total = 0
    const unmatched: string[] = []
    for (const land of lands) {
      const m = metaOf(`chunks/${String(land)}.bin`)
      for (const [mat] of m.submeshes) {
        const spec = m.materials[mat]!
        total++
        const hit = sets.some((t) => tex.sets[t]?.items.some(
          ([name, pal]) => name === spec.tex && pal === (spec.pal ?? '')))
        if (!hit) unmatched.push(`${spec.tex ?? 'null'}/${spec.pal ?? ''}`)
      }
    }
    expect(total).toBe(2552)
    expect(unmatched, `못 찾은 그림: ${[...new Set(unmatched)].join(' ')}`).toHaveLength(0)
  })
})
