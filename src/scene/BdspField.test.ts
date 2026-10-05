// BDSP 지역 (`BdspField`) — 세우는 거리 · 쥐었다 다시 붙이기 · 물 · 풀 · 빛 줄기
import { closeSync, existsSync, openSync, readdirSync, readSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { BoxGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Texture, Vector3 } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  FOG_FLOOR_DROP, fogFloorY, lowestGround,
  boxDistance, FOLIAGE_NORMAL, foliageMaterial, HELD, heldFields, holdField, isFoliage, isLightShaft, liveFoliage, liveWater, WATER_SINK,
  nearestFirst, pickFields, reachFor, takeField, WATER_LOOKS, WATER_METALNESS, WATER_ROUGHNESS, waterLookOf, waterMaterial,
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

describe('지역을 붙이는 차례', () => {
  it('가까운 지역부터 선다 — 상자 안이면 0칸이다', () => {
    const fields = [
      { name: 'area004', box: [384, 672, 584, 872] as const },
      { name: 'area007', box: [384, 672, 734, 872] as const },
      { name: 'area008', box: [736, 192, 926, 800] as const },
    ]
    // 213번도로 (646,813) — 실측 거리 area007 0 · area004 62 · area008 91
    expect(nearestFirst(fields, ['area004', 'area007', 'area008'], 646, 813)).toEqual(['area007', 'area004', 'area008'])
  })

})

describe('뗀 지역 쥐기', () => {
  const built = (tag: string) => ({
    scene: Object.assign(new Group(), { name: tag }),
    fade: {} as FieldFade,
    lights: {} as BdspLights,
    low: null,
    variants: [],
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

describe('안개 바닥 (HANDOFF_20261003 §3-2)', () => {
  const slab = (name: string, y: number): Mesh => {
    const m = new Mesh(new BoxGeometry(10, 1, 10), new MeshStandardMaterial({ name }))
    m.position.y = y
    return m
  }

  it('땅 재질의 가장 낮은 높이를 잰다 — 집 · 나무는 안 센다', () => {
    const root = new Group()
    root.add(slab('M_C_001_Ground_01_01', 5), slab('M_C_001_Cliff_01_01', 2), slab('M_T_001_House_01', -20))
    // 절벽 판(가운데 2 · 두께 1)의 밑이 1.5다. 땅 밑 깊은 곳의 집은 땅이 아니다
    expect(lowestGround(root)).toBeCloseTo(1.5, 6)
  })

  it('접어 둔 땅(판 `R224b`의 땅)은 안 센다 — 노드가 접혀도, 그 부모가 접혀도', () => {
    const root = new Group()
    const folded = slab('M_C_001_Ground_01_01', -9)
    folded.visible = false
    const parent = new Group()
    parent.visible = false
    parent.add(slab('M_C_001_Ground_01_01', -30))
    root.add(slab('M_C_001_Ground_01_01', 5), folded, parent)
    expect(lowestGround(root)).toBeCloseTo(4.5, 6)
  })

  it('땅이 없으면 모른다', () => {
    const root = new Group()
    root.add(slab('M_T_001_House_01', 0))
    expect(lowestGround(root)).toBeNull()
  })

  it('선 지역 중 가장 낮은 땅보다 조금 아래에 깐다 — 주인공 발밑이 아니다', () => {
    expect(fogFloorY([12, 3.5, 40])).toBeCloseTo(3.5 - FOG_FLOOR_DROP, 6)
    expect(fogFloorY([])).toBeNull()
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

  it('⚠️ 물은 그림자를 드리우지도 받지도 않는다 — 켜 둔 뒤에 불러도 끈다 (파이트에어리어 바다 줄무늬)', () => {
    const root = new Group()
    const sea = new Mesh(new PlaneGeometry(), new MeshStandardMaterial({ name: 'M_C_001_SeaWater_03' }))
    const ground = new Mesh(new PlaneGeometry(), new MeshStandardMaterial({ name: 'M_C_001_Ground_01_01' }))
    root.add(sea, ground)
    for (const o of [sea, ground]) { o.castShadow = true; o.receiveShadow = true }
    liveWater(root)
    expect(sea.castShadow).toBe(false)
    expect(sea.receiveShadow).toBe(false)
    expect(ground.castShadow).toBe(true)
    expect(ground.receiveShadow).toBe(true)
  })

  it('⚠️ 수면을 땅 밑으로 조금 내린다 — 같은 높이의 부두 땅과 깊이를 다투지 않게 (해변시티)', () => {
    const root = new Group()
    root.scale.setScalar(2)
    const sea = new Mesh(new PlaneGeometry(), new MeshStandardMaterial({ name: 'M_C_001_SeaWater_03' }))
    const ground = new Mesh(new PlaneGeometry(), new MeshStandardMaterial({ name: 'M_C_001_Ground_01_01' }))
    root.add(sea, ground)
    liveWater(root)
    liveWater(root)
    root.updateMatrixWorld(true)
    const y = (o: Mesh) => o.getWorldPosition(new Vector3()).y
    // 월드에서 2cm — 부모 배율을 되돌리고, 두 번 불러도 한 번만 내린다
    expect(y(ground) - y(sea)).toBeCloseTo(WATER_SINK, 9)
  })
})

describe('BDSP 풀 · 꽃', () => {
  it('세운 풀 · 꽃 · 잎만 고른다 — 땅에 깔린 풀 · 나무 · 집은 아니다', () => {
    for (const name of [
      'M_C_001_ComGrass_01_1', 'M_C_001_GimGrass_03', 'M_C_001_GimGrass_07', 'M_C_001_ComFlower_01', 'M_C_001_Flower_02c',
      'M_T_005_Flower_04b', 'M_C_001_Leaf_01',
    ]) expect(isFoliage(new MeshStandardMaterial({ name })), name).toBe(true)
    for (const name of [
      'M_C_001C_CliffGrass_01', 'M_C_001_PondGrass_01', 'M_C_001_GrassSeam_01', 'M_C_001_Tree_05', 'M_C_001_TreeSeam_01',
      'M_T_002_House_01', 'M_C_001_Ground_01_01',
    ]) expect(isFoliage(new MeshStandardMaterial({ name })), name).toBe(false)
  })

  it('⚠️ 법선을 월드 위쪽으로 박는다 — 뒷면에서 뒤집혀 검게 칠해지지 않는다. 그림 · 색 · 컷 · 양면은 그대로', () => {
    const map = new Texture()
    const was = new MeshStandardMaterial({
      name: 'M_C_001_ComGrass_01_1', map, color: 0x80c040, alphaTest: 0.5, side: DoubleSide, roughness: 0.9, metalness: 0,
    })
    const m = foliageMaterial(was)
    expect(m).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(m.normalNode).toBe(FOLIAGE_NORMAL)
    expect(m.name).toBe(was.name)
    expect(m.map).toBe(map)
    expect(m.color.getHex()).toBe(0x80c040)
    expect(m.alphaTest).toBe(0.5)
    expect(m.side).toBe(DoubleSide)
    expect(m.roughness).toBe(0.9)
  })

  it('풀은 그림자를 안 드리우고 받기는 그대로다 · 나눠 쓰던 재질은 새 것도 나눠 쓴다 · 나무와 땅은 안 건드린다', () => {
    const root = new Group()
    const grass = new MeshStandardMaterial({ name: 'M_C_001_GimGrass_01' })
    const tree = new MeshStandardMaterial({ name: 'M_C_001_Tree_05' })
    const ground = new MeshStandardMaterial({ name: 'M_C_001C_CliffGrass_02' })
    const a = new Mesh(new PlaneGeometry(), grass)
    const b = new Mesh(new PlaneGeometry(), grass)
    const c = new Mesh(new PlaneGeometry(), tree)
    const d = new Mesh(new PlaneGeometry(), ground)
    root.add(a, b, c, d)
    root.traverse((o) => { o.castShadow = true; o.receiveShadow = true })
    expect(liveFoliage(root)).toBe(1)
    expect(a.material).toBe(b.material)
    expect((a.material as unknown as MeshStandardNodeMaterial).normalNode).toBe(FOLIAGE_NORMAL)
    expect(a.castShadow).toBe(false)
    expect(a.receiveShadow).toBe(true)
    expect(c.material).toBe(tree)
    expect(c.castShadow).toBe(true)
    expect(d.material).toBe(ground)
    expect(d.castShadow).toBe(true)
  })

  // 거울 인스턴스는 three가 인스턴스마다 앞뒤를 바꿔 주지 않아 같은 꼴로 검을 수 있다 (`field.ts`의 `decompose`가 거울을 배율 x의
  // 부호로 남긴다). 구운 지역에 거울이 하나도 없음을 잰다 — 생기면 이 시험이 먼저 안다
  const FIELD_DIR = 'public/models/field'
  it.skipIf(!existsSync(FIELD_DIR))('구운 지역에 거울(행렬식 < 0) 인스턴스가 없다', () => {
    let total = 0
    const mirrored: string[] = []
    for (const file of readdirSync(FIELD_DIR).filter((f) => /^area\d+\.glb$/.test(f))) {
      const fd = openSync(`${FIELD_DIR}/${file}`, 'r')
      try {
        const read = (at: number, n: number): Buffer => {
          const out = Buffer.alloc(n)
          readSync(fd, out, 0, n, at)
          return out
        }
        const jsonLength = read(12, 4).readUInt32LE(0)
        const gltf = JSON.parse(read(20, jsonLength).toString('utf8')) as {
          nodes: { mesh?: number, matrix?: number[], extensions?: { EXT_mesh_gpu_instancing?: { attributes: { SCALE?: number } } } }[]
          accessors: { bufferView: number, byteOffset?: number, count: number }[]
          bufferViews: { byteOffset?: number, byteStride?: number }[]
        }
        const bin = 20 + jsonLength + 8
        for (const [i, n] of gltf.nodes.entries()) {
          if (n.mesh === undefined) continue
          const scale = n.extensions?.EXT_mesh_gpu_instancing?.attributes.SCALE
          if (scale !== undefined) {
            const a = gltf.accessors[scale]!
            const v = gltf.bufferViews[a.bufferView]!
            const stride = v.byteStride ?? 12
            const raw = read(bin + (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride * a.count)
            for (let k = 0; k < a.count; k++) {
              total++
              const s = [0, 1, 2].map((c) => raw.readFloatLE(k * stride + c * 4))
              if (s[0]! * s[1]! * s[2]! < 0) mirrored.push(`${file} 노드 ${String(i)} #${String(k)}`)
            }
            continue
          }
          total++
          const m = n.matrix
          if (!m) continue
          const det = m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!)
            + m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!)
          if (det < 0) mirrored.push(`${file} 노드 ${String(i)}`)
        }
      } finally { closeSync(fd) }
    }
    expect(total).toBeGreaterThan(0)
    expect(mirrored).toEqual([])
  })
})

describe('빛 줄기', () => {
  it('창빛 · 조명 · 입구 빛은 줄기다 — `BdspRoom`과 같은 규칙', () => {
    for (const name of ['M_C_001_WindowLight_01', 'M_C_001_SpotLight_04', 'M_D_005_SpotLight_01', 'M_C_001_EntranceLight_01']) {
      expect(isLightShaft(new MeshStandardMaterial({ name })), name).toBe(true)
    }
  })

  it('길잡이 등 · 가로등 · 바깥 등 · 입구 빛 웅덩이는 줄기가 아니다', () => {
    for (const name of [
      'M_T_012_GuideLight_01', 'M_C_001_StreetLight_01', 'M_C_001_OutLight_01', 'M_C_001_PokeCenLight_01', 'M_D_006_MachineLight_01',
    ]) expect(isLightShaft(new MeshStandardMaterial({ name })), name).toBe(false)
  })
})
