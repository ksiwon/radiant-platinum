// 바위 한 덩이의 모양 (FIRST_PERSON §6.3).
//
// ⚠️ **20면체를 눌러 쓰지 않는다.** 예전 바위는 `IcosahedronGeometry(0.5, 1)`에
// 정점마다 난수를 밀고(`lumpy`) 법선을 공처럼 폈다(`ballNormals`). 그러면
// 어느 바위나 같은 **울퉁불퉁한 공**이고, 능선이 없어서 가까이 가면 고무공으로
// 읽힌다. 명세가 `ballNormals`를 새 바위에 쓰지 말라고 못 박은 자리다.
//
// 대신 **높이 링 넷 × 둘레 일곱 점**으로 세운다. 링마다 반지름과 중심이 따로라
// 실루엣이 회전체가 아니고, 둘레의 들쭉날쭉함은 **표에 적어 둔 값**이다 —
// 정점마다 난수를 주면 같은 계열이 매번 다른 모양이 되고 검수할 것이 없어진다.
//
// 법선은 면마다 따로다(비인덱스 → 평면 법선). 능선이 각지게 서야 바위로 읽힌다.

/** 둘레를 몇 점으로 도는가. 명세가 6~8을 말한다 */
export const ROCK_SIDES = 7

/** 바위 한 계열의 모양표 */
export interface RockRecipe {
  /** 이름 — 화면 진단과 시험이 이 이름으로 부른다 */
  id: string
  /**
   * 링 넷. `[정규화 높이 0~1, 반지름(폭 배수), 중심 x, 중심 z]`.
   *
   * 높이 0이 땅에 닿는 자리, 1이 꼭대기다. 반지름이 중간 링에서 제일 크면
   * 아래가 좁아 **박힌 돌**로 보이고, 밑이 제일 크면 얹힌 자갈로 보인다
   */
  rings: readonly (readonly [number, number, number, number])[]
  /**
   * 둘레 점마다 곱하는 반지름. 링을 올라갈 때 **한 칸씩 밀어** 쓴다 —
   * 그대로 쓰면 들쭉날쭉함이 세로줄로 서서 기둥처럼 보인다
   */
  bumps: readonly number[]
}

/**
 * 검수된 변주 셋. 배치마다 새 모양을 만들지 않고 이 셋 중 하나를 고른다.
 *
 * 값은 **시제품 초기값**이다 — 원작에 바위의 입체가 없으므로(판 한 장이다)
 * 지어낼 수밖에 없는 자리이고, 지어낸 것은 지어냈다고 적는다. 대신 폭과 높이와
 * 색은 원작 판에서 온다 (`Rocks`의 머리말 · `rockAspect`)
 */
export const ROCK_RECIPES: readonly RockRecipe[] = [
  {
    id: '납작한 돌',
    rings: [[0, 0.50, 0, 0], [0.34, 0.58, 0.03, -0.02], [0.72, 0.44, -0.04, 0.03], [1, 0.15, 0.02, 0.01]],
    bumps: [1.06, 0.90, 1.12, 0.86, 1.04, 0.94, 1.02],
  },
  {
    id: '모난 돌',
    rings: [[0, 0.46, 0, 0], [0.28, 0.57, -0.05, 0.03], [0.66, 0.38, 0.05, -0.04], [1, 0.11, -0.03, 0.02]],
    bumps: [0.88, 1.14, 0.92, 1.08, 0.84, 1.10, 0.96],
  },
  {
    id: '둥근 돌',
    rings: [[0, 0.52, 0, 0], [0.40, 0.55, 0.02, 0.05], [0.78, 0.33, -0.02, -0.05], [1, 0.10, 0.03, -0.02]],
    bumps: [1.02, 0.97, 1.05, 0.95, 1.03, 0.98, 1.00],
  },
]

/**
 * 실루엣에서 **높이/폭**을 구한다.
 *
 * 원작 판은 45°로 누운 사각형이고, 그 각도에서 보이는 세로 길이는
 * `(높이 + 깊이) × cos45°`다. 깊이를 폭과 같다고 두면(둥근 돌) 높이가 나온다.
 *
 * ⚠️ **모든 바위에 한 값을 못 쓴다.** 판을 가득 채운 그림만 있는 것이 아니다 —
 * 칸의 위아래가 비어 있으면 그만큼 낮은 돌이다. 그래서 그 칸에서 **실제로
 * 불투명한 줄과 칸의 비율**을 받아 계열마다 다시 센다. 둘 다 1이면 예전 값
 * 0.414가 그대로 나온다
 *
 * @param rows 칸 높이 대비 불투명한 줄의 비율 (0~1)
 * @param cols 칸 폭 대비 불투명한 칸의 비율 (0~1)
 */
export function rockAspect(rows: number, cols: number): number {
  const f = Math.min(1, Math.max(0.05, rows))
  const g = Math.min(1, Math.max(0.05, cols))
  const tall = f / (Math.SQRT1_2 * g) - 1
  // 너무 납작하면 판때기로 돌아가고, 너무 솟으면 기둥이 된다
  return Math.min(0.95, Math.max(0.22, tall))
}

/**
 * 덩이 하나의 삼각형. **비인덱스**라 면마다 제 법선이 선다.
 *
 * 원점은 밑바닥 한가운데고 폭이 1이다. 높이는 `tall`, 밑을 `sink`만큼 묻는다 —
 * 딱 얹어 두면 땅과의 경계가 칼로 자른 듯 떨어진다.
 *
 * 삼각형 수는 `(링 수 − 1) × 둘레 × 2 + 둘레` — 링 넷·둘레 일곱이면 49개다
 * (§10.1의 바위 상한 160 안)
 */
export function rockPositions(recipe: RockRecipe, tall: number, sink: number): Float32Array {
  const n = ROCK_SIDES
  const rings = recipe.rings
  const lift = -sink * tall
  /** 링 `r`의 둘레 점 `i` */
  const at = (r: number, i: number): [number, number, number] => {
    const [h, radius, cx, cz] = rings[r]!
    const bump = recipe.bumps[(i + r) % recipe.bumps.length]!
    const a = (i / n) * Math.PI * 2
    return [cx + Math.cos(a) * radius * bump, lift + h * tall, cz + Math.sin(a) * radius * bump]
  }
  const out: number[] = []
  const push = (...ps: [number, number, number][]): void => {
    for (const p of ps) out.push(p[0], p[1], p[2])
  }
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const a = at(r, i), b = at(r, j), c = at(r + 1, j), d = at(r + 1, i)
      // ⚠️ **밖에서 보이게 감는다.** 뒤집으면 겉면이 잘리고 속이 보여서 빛을
      // 등진다 — 한낮의 물가시티 방파제가 #020101이었다 (`rockShape.test`)
      push(a, c, b)
      push(a, d, c)
    }
  }
  // 꼭대기는 마지막 링의 한가운데로 모은다
  const top = rings[rings.length - 1]!
  const apex: [number, number, number] = [top[2], lift + top[0] * tall, top[3]]
  for (let i = 0; i < n; i++) {
    push(at(rings.length - 1, (i + 1) % n), at(rings.length - 1, i), apex)
  }
  return new Float32Array(out)
}

/**
 * 자리에서 변주를 고른다. 같은 바위는 늘 같은 모습이어야 한다 —
 * `Math.random`이면 청크를 다시 세울 때마다 흔들린다
 */
export function rockVariant(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + 17.3) * 43758.5453
  return Math.floor((s - Math.floor(s)) * ROCK_RECIPES.length) % ROCK_RECIPES.length
}
