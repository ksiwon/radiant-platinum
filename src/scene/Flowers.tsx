// 서 있는 꽃 (DATA.md §2.2)
//
// 원작의 화단은 **바닥 타일 그림**이다 — `nhana`·`shana`·`rhana`와 연고시티의
// `t3_fl_*`. 고정 부감에서는 그것으로 꽃밭이었지만, 3인칭 카메라는 눈높이가
// 낮아서 잔디 위에 색종이를 뿌려 놓은 것처럼 보인다.
//
// 긴 풀과 같은 손질이다 (`Grass.tsx`) — 바닥 그림은 그대로 두고 그 위에 실제로
// 서 있는 것을 얹는다. 다만 자리를 정하는 근거가 다르다: 풀숲은 **타일 거동값**이
// 말해 주는데(`0x0002`) 꽃은 순전히 장식이라 거동값이 없다. 그래서 원작이 그
// 칸에 무슨 그림을 깔았는지로 고른다 (`plates.flowerSites`) — 청크 666개 중
// 96개에 화단이 있고 꽃 칸이 8,140개다 (`flowers.test`).
//
// **꽃송이 모양은 우리가 만든 것이다.** 원작에 3D 꽃이 없다. 대신 색은 그 화단
// 그림에서 실제로 쓰인 꽃잎 색을 뽑아 쓴다 (`plates.flowerColors`).
import { useEffect, useMemo } from 'react'
import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh, Matrix4,
  MeshLambertMaterial, Quaternion, Vector3,
} from 'three'

/** 꽃잎 몇 장. 다섯이면 어느 각도에서도 하나는 정면으로 온다 */
const PETALS = 5
/** 꽃 키(타일). 긴 풀(0.5)보다 낮아야 풀숲과 안 헷갈린다 */
const STEM = 0.22
/** 꽃잎 길이 */
const PETAL_LEN = 0.11
/** 꽃잎 폭 */
const PETAL_WIDE = 0.07

export interface FlowerField {
  /** 송이 자리 `[x, y, z]`가 셋씩 이어진다 */
  spots: Float32Array
  /** 송이마다 고를 꽃잎 색 */
  colors: readonly number[]
  /** 줄기 색 */
  stem: number
}

/** 자리에서 뽑는 난수. 프레임마다 흔들리면 안 된다 (`Grass`의 것과 같은 규칙) */
function hash(x: number, z: number, salt: number): number {
  const s = Math.sin(x * 311.7 + z * 157.1 + salt * 73.3) * 43758.5453
  return s - Math.floor(s)
}

/**
 * 꽃 한 송이. 줄기 하나에 꽃잎이 방사로 붙는다.
 *
 * 정점 색으로 꽃잎과 줄기를 나눈다 — 재질 하나로 인스턴스를 다 그리려면
 * 색이 지오메트리에 있어야 한다
 */
function blossom(petal: Color, stem: Color): BufferGeometry {
  const position: number[] = []
  const color: number[] = []
  const push = (x: number, y: number, z: number, c: Color) => {
    position.push(x, y, z)
    color.push(c.r, c.g, c.b)
  }

  // 줄기 — 얇은 세로 판 한 장
  const w = 0.012
  push(-w, 0, 0, stem); push(w, 0, 0, stem); push(w, STEM, 0, stem)
  push(-w, 0, 0, stem); push(w, STEM, 0, stem); push(-w, STEM, 0, stem)

  // 꽃잎 — 꼭대기에서 방사로 뻗는다. 살짝 위로 들어 올려 접시 모양이 된다
  for (let i = 0; i < PETALS; i++) {
    const a = (i / PETALS) * Math.PI * 2
    const dx = Math.cos(a), dz = Math.sin(a)
    const px = Math.cos(a + Math.PI / 2) * PETAL_WIDE
    const pz = Math.sin(a + Math.PI / 2) * PETAL_WIDE
    const tipY = STEM + PETAL_LEN * 0.35
    push(0, STEM, 0, petal)
    push(dx * PETAL_LEN - px, tipY, dz * PETAL_LEN - pz, petal)
    push(dx * PETAL_LEN + px, tipY, dz * PETAL_LEN + pz, petal)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * 색이 다른 꽃을 섞어 심는다.
 *
 * 한 색으로 다 심으면 원작 화단의 알록달록함이 사라진다 — 원작 그림에도
 * 색이 서너 가지 들어 있고 `flowerColors`가 그걸 뽑아 준다
 */
export function Flowers({ field }: { field: FlowerField | null }) {
  const meshes = useMemo(() => {
    if (!field || field.spots.length === 0) return []
    const stem = new Color(0x3f7a3a)
    const total = field.spots.length / 3
    return field.colors.map((rgb, ci) => {
      const geometry = blossom(new Color(rgb), stem)
      const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide })
      const mesh = new InstancedMesh(geometry, material, total)
      mesh.name = '꽃'
      const m = new Matrix4()
      const at = new Vector3()
      const spin = new Quaternion()
      const up = new Vector3(0, 1, 0)
      const one = new Vector3(1, 1, 1)
      let n = 0
      for (let i = 0; i < total; i++) {
        // 송이마다 색을 하나 고른다. 같은 자리에서 늘 같은 색이 나와야 한다
        if (Math.floor(hash(field.spots[i * 3]!, field.spots[i * 3 + 2]!, 9) * field.colors.length)
          !== ci) continue
        at.set(field.spots[i * 3]!, field.spots[i * 3 + 1]!, field.spots[i * 3 + 2]!)
        spin.setFromAxisAngle(up, hash(at.x, at.z, 3) * Math.PI * 2)
        const s = 0.8 + hash(at.x, at.z, 5) * 0.5
        mesh.setMatrixAt(n++, m.compose(at, spin, one.set(s, s, s)))
      }
      mesh.count = n
      mesh.castShadow = false
      mesh.receiveShadow = true
      return mesh
    })
  }, [field])

  useEffect(() => () => {
    for (const m of meshes) { m.geometry.dispose(); (m.material as MeshLambertMaterial).dispose() }
  }, [meshes])

  return <>{meshes.map((m, i) => <primitive key={i} object={m} />)}</>
}
