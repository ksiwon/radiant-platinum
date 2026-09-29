// 지역 빛 — 시간마다 바뀌는 네 빛 · 재질색 (`data/arealight.narc` · `overlay005/area_light.c` · DATA.md §2.21h)
//
// 필드는 지역(`area_data.narc`의 `areaLightArchiveID`)마다 네 벌 중 하나를 쓴다 — 0 바깥(시간으로 바뀐다) · 1 안 ·
// 2 · 3(깨어진 세계). 한 벌은 **글**이다: 틀마다
//
//     끝 시각(자정부터 초 ÷ 2),
//     빛 0~3 — 켬,r,g,b,x,y,z,          (켬이 1이 아니면 없는 빛 — 색 0)
//     확산 r,g,b, · 환경 · 반사 · 방사
//     (빈 줄)
//
// 을 `EOF` 줄까지 잇는다. 빛 방향은 fx16이고 ±4096에서 자른다(`AreaLightTemplate_ParseLightAttrs`).
// 지금 쓰는 곳은 배로 건너가기다 — 배 모델이 이 색을 받는다(`NNS_G3dMdlUseGlbDiff` 등 · `canalave_ship.c`)
//
// ⚠️ **굽는 쪽 둘이 이 함수 하나를 부른다** — 노드 쪽(`tools/extract/areaLight.mjs`)은 롬을 여는 자리만 다르다
import { narcCount, narcEntry } from './nds'
import { json, readRomFile, type ConvertContext, type Produced } from './convertTypes'

const NARC = '/data/arealight.narc'

type Rgb = [number, number, number]
export interface AreaLightTemplate {
  /** 이 틀이 끝나는 시각 (자정부터 초 ÷ 2) */
  end: number
  /** 빛 넷 — 없는 빛은 null */
  lights: ({ color: Rgb, dir: [number, number, number] } | null)[]
  diffuse: Rgb
  ambient: Rgb
  specular: Rgb
  emission: Rgb
}

const clamp16 = (v: number): number => Math.max(-4096, Math.min(4096, v))

/** 한 벌을 푼다 (`AreaLightTemplate_New`) */
function parseAreaLight(text: string): AreaLightTemplate[] {
  const lines = text.split('\r').map((l) => l.replace(/^\n/, ''))
  const out: AreaLightTemplate[] = []
  const nums = (line: string | undefined): number[] => (line ?? '').split(',').filter((p) => p.trim() !== '').map((p) => Number.parseInt(p, 10))
  let at = 0
  while (at < lines.length && !lines[at]!.startsWith('EOF')) {
    const end = nums(lines[at++])[0] ?? 0
    const lights: AreaLightTemplate['lights'] = []
    for (let j = 0; j < 4; j++) {
      const [on = 0, r = 0, g = 0, b = 0, x = 0, y = 0, z = 0] = nums(lines[at++])
      lights.push(on === 1 ? { color: [r, g, b], dir: [clamp16(x), clamp16(y), clamp16(z)] } : null)
    }
    const color = (): Rgb => { const [r = 0, g = 0, b = 0] = nums(lines[at++]); return [r, g, b] }
    const diffuse = color(), ambient = color(), specular = color(), emission = color()
    at++ // 빈 줄
    out.push({ end, lights, diffuse, ambient, specular, emission })
  }
  return out
}

export async function convertAreaLight(ctx: ConvertContext): Promise<Produced> {
  const narc = await readRomFile(ctx, NARC)
  const files: AreaLightTemplate[][] = []
  for (let i = 0; i < (narcCount(narc) ?? 0); i++) {
    const member = narcEntry(narc, i)
    if (!member) throw new Error(`arealight ${String(i)}번이 없다`)
    files.push(parseAreaLight(new TextDecoder('ascii').decode(member)))
  }
  if (files.length !== 4) throw new Error(`arealight가 ${String(files.length)}벌이다 — 넷이라야 한다 (AREA_LIGHT_FILE_COUNT)`)
  return new Map([['data/areaLight.json', json({ files })]])
}
