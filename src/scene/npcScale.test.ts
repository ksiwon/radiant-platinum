// 사람 키 (DATA.md §2.16)
//
// ⚠️ **NPC가 주인공 허리춤에 서 있었다.** 주인공만 `.dae`를 거쳐 오고
// (`dawn_to_glb.py`) 나머지 사람은 BDSP 번들에서 바로 굽는데(`bdspGlb.py`)
// **두 길의 단위가 다르다.** 그런데 "주인공이 원본 키에서 줄어든 배수"를
// `dawn.glb`의 키로 재서 NPC에 곱했다 — 신사가 1.05m로 섰다.
//
// 그래서 여기서는 **구운 파일을 실제로 열어 재고**, 그 배수로 섰을 때 사람 키가
// 사람 키인지 본다. 상수만 비교하면 파일이 바뀌었을 때 조용히 통과한다.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BDSP_PLAYER_HEIGHT, BDSP_TO_WORLD, PLAYER_HEIGHT } from '../engine/model/normalize'

const MODELS = resolve(__dirname, '../../public/models')
const present = existsSync(resolve(MODELS, 'dawn.glb')) && existsSync(resolve(MODELS, 'npc'))
const maybe = present ? describe : describe.skip

interface Gltf {
  scene?: number
  scenes: { nodes: number[] }[]
  nodes: {
    name?: string
    mesh?: number
    skin?: number
    children?: number[]
    matrix?: number[]
    translation?: number[]
    rotation?: number[]
    scale?: number[]
  }[]
  meshes: { primitives: { attributes: { POSITION: number } }[] }[]
  accessors: { min?: number[], max?: number[] }[]
}

/** glb의 JSON 덩이만 꺼낸다. 정점은 접근자의 min/max에 이미 들어 있다 */
function gltfOf(file: string): Gltf {
  const buf = readFileSync(file)
  let at = 12
  while (at < buf.length) {
    const len = buf.readUInt32LE(at)
    const type = buf.readUInt32LE(at + 4)
    if (type === 0x4e4f534a) {
      return JSON.parse(buf.subarray(at + 8, at + 8 + len).toString('utf8')) as Gltf
    }
    at += 8 + len
  }
  throw new Error(`JSON 덩이가 없다: ${file}`)
}

/**
 * 바인드 포즈의 키. `normalizeModel`이 `Box3.setFromObject`로 재는 것과 같은 값이다.
 *
 * 스킨드 메시는 **정점 값 그대로** 재고 노드 변환을 안 태운다. 스킨 공간이라
 * 바인드 행렬 짝이 래퍼 변환을 도로 지우기 때문인데, 믿고 쓴 것이 아니라
 * 실제로 three로 마흔둘을 다 재서 한 파일도 안 어긋나는 것을 봤다 —
 * `dawn.glb`는 `Origin`에 1.7042 배가 걸려 있는데도 2.5095가 나온다.
 *
 * 스킨이 없는 메시는 그 얘기가 아니라 노드 변환이 그대로 실린다. 지금 마흔셋에
 * 하나도 없지만, 생기면 이 함수가 조용히 틀리므로 **걸리면 세운다**
 */
function heightOf(g: Gltf): number {
  let lo = Infinity
  let hi = -Infinity
  g.nodes.forEach((node) => {
    if (node.mesh === undefined) return
    if (node.skin === undefined) {
      throw new Error(`${node.name ?? '?'}에 스킨이 없다 — 노드 변환을 태워서 재야 한다`)
    }
    for (const prim of g.meshes[node.mesh]!.primitives) {
      const acc = g.accessors[prim.attributes.POSITION]!
      if (!acc.min || !acc.max) continue
      lo = Math.min(lo, acc.min[1]!)
      hi = Math.max(hi, acc.max[1]!)
    }
  })
  return hi - lo
}

const heightIn = (file: string): number => heightOf(gltfOf(file))

maybe('사람 키', () => {
  const npcs = readdirSync(resolve(MODELS, 'npc'))
    .filter((f) => f.endsWith('.glb'))
    .map((f) => [f.replace('.glb', ''), heightIn(resolve(MODELS, 'npc', f))] as const)

  it('주인공 파일과 번들 사람은 단위가 다르다 — 이 시험이 성립하는 근거다', () => {
    // 두 길이 같은 단위였다면 아래 시험들이 저절로 통과한다. 실제로는 두 배 가까이
    // 벌어져 있고, 그 차이가 곧 NPC가 60%로 줄어든 이유였다
    expect(heightIn(resolve(MODELS, 'dawn.glb'))).toBeCloseTo(2.5095, 3)
    // 번들에서 바로 구운 같은 사람(`pc0002_00`)의 키. `bdspGlb.py`가 굽는 자리에서
    // 찍어 준다 (`height 1.4725260734558105`)
    expect(BDSP_PLAYER_HEIGHT).toBeCloseTo(1.4725, 4)
    expect(BDSP_TO_WORLD).toBeCloseTo(PLAYER_HEIGHT / BDSP_PLAYER_HEIGHT, 10)
  })

  it('구운 사람이 다 사람 키로 선다', () => {
    expect(npcs.length).toBeGreaterThan(30)
    for (const [name, native] of npcs) {
      const h = native * BDSP_TO_WORLD
      // 제일 작은 것이 꼬맹이(0.98) · 제일 큰 것이 일꾼(1.95)이다
      expect(h, `${name} ${h.toFixed(2)}m`).toBeGreaterThan(0.9)
      expect(h, `${name} ${h.toFixed(2)}m`).toBeLessThan(2.1)
    }
  })

  it('어른은 주인공보다 크고 아이는 작다 — 다 같은 키로 맞추지 않는다', () => {
    const at = (name: string): number =>
      npcs.find(([n]) => n === name)![1] * BDSP_TO_WORLD
    // 신사(tr0046) · 일꾼은 열 살 빛나보다 커야 한다
    expect(at('gentleman')).toBeGreaterThan(PLAYER_HEIGHT)
    expect(at('worker')).toBeGreaterThan(PLAYER_HEIGHT)
    // 곤충소년 · 꼬맹이는 작아야 한다
    expect(at('bugcatcher')).toBeLessThan(PLAYER_HEIGHT)
    expect(at('tuber')).toBeLessThan(PLAYER_HEIGHT)
  })

  it('주인공 파일 키를 분모로 쓰면 어른이 주인공보다 작아진다 — 그게 그 버그였다', () => {
    // 이 시험이 없으면 위 조건은 "지금 값으로는 맞다"밖에 못 말한다. 틀린 배수를
    // 직접 넣어 보고 **실제로 깨지는지** 본다
    const wrong = PLAYER_HEIGHT / heightIn(resolve(MODELS, 'dawn.glb'))
    const gentleman = npcs.find(([n]) => n === 'gentleman')![1]
    expect(gentleman * wrong).toBeLessThan(PLAYER_HEIGHT)
    expect(gentleman * wrong).toBeCloseTo(1.049, 2)
  })
})
