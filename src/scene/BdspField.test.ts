// BDSP 지역 (`BdspField`) — 세우는 거리 · 쥐었다 다시 붙이기 · 물
import { afterEach, describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  boxDistance, HELD, heldFields, holdField, liveWater, pickFields, reachFor, takeField, WATER_LOOKS, WATER_METALNESS,
  WATER_ROUGHNESS, waterLookOf, waterMaterial,
} from './BdspField'
import { DAY } from './fx/sky'
import type { BdspLights } from './bdspLights'
import type { FieldFade } from './fieldFade'

/** 실제 목차의 상자 셋 (`models/field/index.json`) */
const FIELDS = [
  { name: 'area001', box: [64, 670, 321, 934] as const },
  { name: 'area002', box: [256, 513, 348, 797] as const },
  { name: 'area004', box: [384, 672, 584, 872] as const },
]

describe('지역을 세우는 거리', () => {
  it('안개가 다 덮는 거리에서 세운다 — 낮 130칸 + 카메라 몫', () => {
    expect(reachFor(DAY.fogFar)).toBe(140)
    // 밤 · 눈보라는 안개가 가까워 그만큼 덜 세운다
    expect(reachFor(100)).toBe(110)
    // 안개가 아주 멀어도(연출) 낮 안개를 넘겨 세우지 않는다 — GPU 몫이 묶인다
    expect(reachFor(10_000)).toBe(140)
  })

  it('상자까지 곧은 거리로 잰다 — 모서리 너머는 대각선이다', () => {
    expect(boxDistance([0, 0, 10, 10], 5, 5)).toBe(0)
    expect(boxDistance([0, 0, 10, 10], 13, 5)).toBe(3)
    expect(boxDistance([0, 0, 10, 10], 13, 14)).toBe(5)
  })

  it('84칸 밖 지역은 80칸이면 안 서서 안개가 덜 덮은 자리에서 튀어나왔다 — 안개 끝에서는 미리 선다', () => {
    // 떡잎마을 주인공 집 문 (원작 워프 116, 875) — 이웃 상자가 다 140칸 밖이다
    expect(pickFields(FIELDS, 116, 875, 140, [])).toEqual(['area001'])
    // area004 상자 서쪽 끝(x 384)에서 84칸 — 낮 안개(38~130칸)가 84칸에서 반쯤만 덮는다
    expect(pickFields(FIELDS, 300, 760, 80, [])).toEqual(['area001', 'area002'])
    expect(pickFields(FIELDS, 300, 760, reachFor(DAY.fogFar), [])).toEqual(['area001', 'area002', 'area004'])
  })

  it('이미 선 지역은 조금 더 멀어져야 뗀다 — 경계에서 붙였다 뗐다 하지 않는다', () => {
    const x = 584 + 145, z = 700
    expect(pickFields(FIELDS, x, z, 140, [])).toEqual([])
    expect(pickFields(FIELDS, x, z, 140, ['area004'])).toEqual(['area004'])
  })
})

describe('뗀 지역 쥐기', () => {
  const built = (tag: string) => ({
    scene: Object.assign(new Group(), { name: tag }),
    fade: {} as FieldFade,
    lights: {} as BdspLights,
  })
  afterEach(() => { for (const n of heldFields()) takeField(n) })

  it('`HELD`벌까지 쥐고, 넘치면 가장 오래된 것만 버린다', () => {
    const dropped: string[] = []
    const drop = (b: { scene: Group }): void => { dropped.push(b.scene.name) }
    holdField('area001', built('area001'), drop)
    holdField('area002', built('area002'), drop)
    expect(dropped).toEqual([])
    holdField('area004', built('area004'), drop)
    expect(HELD).toBe(2)
    expect(dropped).toEqual(['area001'])
    expect(heldFields()).toEqual(['area002', 'area004'])
  })

  it('다시 붙이면 같은 씬을 꺼낸다 — 처음부터 다시 받지 않는다', () => {
    const b = built('area001')
    holdField('area001', b, () => {})
    expect(takeField('area001')).toBe(b)
    expect(takeField('area001')).toBeNull()
  })
})

describe('BDSP 물', () => {
  it('물 재질은 이름으로 고른다 — 바다 · 호수 · 강 · 용암', () => {
    for (const name of ['M_C_001_Water_03', 'M_C_001_SeaWater_03', 'M_C_001_LakeWater_01', 'M_R_209_Water_01', 'M_C_001_Lava_01']) {
      expect(waterLookOf(new MeshStandardMaterial({ name })), name).not.toBeNull()
    }
    expect(waterLookOf(new MeshStandardMaterial({ name: 'M_C_001_Pond_01' }))).toBeNull()
  })

  it('원작 물빛을 쓴다 — 강이 하얀 판 · 용암이 파란 판이 되지 않는다', () => {
    // 변환기가 실은 `_Color`: 강은 흰색, 용암은 물과 같은 파랑이었다
    expect(WATER_LOOKS.M_R_209_Water_01!.water).toEqual([0, 0.427, 1])
    const lava = WATER_LOOKS.M_C_001_Lava_01!.water
    expect(lava[0]).toBeGreaterThan(lava[2])
  })

  it('매끈한 노드 재질로 갈아 끼운다 — 같은 재질을 나눠 쓰던 메시는 새 것도 나눠 쓴다', () => {
    const root = new Group()
    const sea = new MeshStandardMaterial({ name: 'M_C_001_SeaWater_03' })
    const ground = new MeshStandardMaterial({ name: 'M_C_001_Ground_01_01' })
    const a = new Mesh(new PlaneGeometry(), sea)
    const b = new Mesh(new PlaneGeometry(), sea)
    const c = new Mesh(new PlaneGeometry(), ground)
    root.add(a, b, c)
    expect(liveWater(root)).toBe(1)
    expect(a.material).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(a.material).toBe(b.material)
    expect(c.material).toBe(ground)
    const m = a.material as unknown as MeshStandardNodeMaterial
    expect(m.roughness).toBe(WATER_ROUGHNESS)
    expect(m.roughness).toBeLessThanOrEqual(0.2)
    expect(m.metalness).toBe(WATER_METALNESS)
    expect(m.metalness).toBeGreaterThan(0)
    // 물결과 하늘 반사는 노드다 — 발광은 안 켠다
    expect(m.normalNode).not.toBeNull()
    expect(m.colorNode).not.toBeNull()
    expect(m.emissiveNode).toBeNull()
    expect(m.emissive.getHex()).toBe(0)
  })

  it('양면은 원래 재질을 따른다', () => {
    const was = new MeshStandardMaterial({ name: 'M_C_001_Water_03', side: 2 })
    expect(waterMaterial(was, WATER_LOOKS.M_C_001_Water_03!).side).toBe(2)
  })
})
