// 버릴 그림은 **씬에서 손을 뗀 뒤에** 버린다 (REPAIR §48)
//
// ⚠️ **그 자리에서 버리면 아직 쓰는 것을 버린다** —
// `Destroyed texture [Texture "chunk-slice 32x32"] used in a submit`.
// `journey` ⑯(콘솔이 조용하다)이 이것으로 떨어졌고, 간헐적이었다 — 버리는 그
// 순간에 그 그림을 문 메시가 씬에 남아 있었느냐에 달렸기 때문이다.
//
// **임자와 원인을 둘 다 실측으로 짚었다.**
//
// ① 임자: three가 GPU 라벨을 `texture.name`에서 가져가므로(`WebGPUTextureUtils`)
//    우리가 만드는 텍스처 열셋에 이름을 달았다. 그러자 `unlabeled`가
//    `chunk-slice 32x32`로 바뀌었다 — `scene/chunkMesh.sliceTexture`가 낸
//    맵·소품 그림이고, 버리는 자리는 `dropMaterial`이다
// ② 원인: 버리려는 순간 씬을 훑어 「아직 붙어 있나」를 셌다. 한 판에 **47건**이
//    붙은 채였고(39건이 32×32 · 8건이 16×16), 안 버리고 기다린 그 판에서
//    드라이버 오류가 **0건**이 됐다
//
// ⚠️ **프레임을 세는 것만으로는 안 닫힌다.** 처음엔 「나간 프레임 두 장만큼
// 미룬다」로 고쳤는데 오류가 1·0·5건에서 **12·12·3·7건으로 늘었다** — 버리는
// 시점이 뒤로 가면서 아직 그리는 구간과 겹치는 길이가 길어졌기 때문이다.
// 세어야 하는 것은 프레임이 아니라 **씬이 아직 무는가**다.
//
// ⚠️ **안 버릴 수는 없다.** 사람 판때기(`scene/npcTexture`)는 설치본을 갈아
// 끼울 때 한 번만 놓으므로 그냥 안 버려도 되지만, 맵 그림은 걸을 때마다
// 갈아치운다 — 안 버리면 그만큼 계속 쌓인다 (REPAIR §46.3의 실측이 그것이다)
import type { Mesh, Texture } from 'three'
import { sceneRefs } from './sceneRefs'

/**
 * 처음 몇 장을 기다리나.
 *
 * 이 셈은 **한 장이 실제로 나간 뒤** 줄어든다 (`scene/EngineDriver`의
 * `markPresented` 다음). 버리라고 한 그림이 그 장에 이미 적혀 있을 수 있으니
 * 한 장으로는 모자라고, 두 장이면 그 다음 장까지 적히고 난 뒤다
 */
const RETIRE_FRAMES = 2
/**
 * 아직 붙어 있었으면 몇 장 뒤에 다시 보나.
 *
 * ⚠️ **매 장 훑으면 안 된다.** 씬을 통째로 훑는 일이라, 안 떨어지는 것이
 * 하나라도 있으면 그 값이 프레임마다 든다. 반 초에 한 번이면 버리는 것이
 * 그만큼 늦을 뿐이고 맵을 갈아타는 간격에 비하면 짧다
 */
const RECHECK_FRAMES = 30

const retiring: { tex: Texture; left: number }[] = []

/** 이 그림을 곧 버린다 — 씬이 손을 뗀 뒤에 */
export function retireTexture(tex: Texture): void {
  retiring.push({ tex, left: RETIRE_FRAMES })
}

/** 지금 씬에 붙어 있는 그림 전부. 한 번 훑어 모은다 */
function attached(): Set<Texture> {
  const out = new Set<Texture>()
  const scene = sceneRefs.stage.scene
  if (!scene) return out
  scene.traverse((o) => {
    const held = (o as Mesh).material as unknown
    if (!held) return
    for (const one of Array.isArray(held) ? held : [held]) {
      const map = (one as { map?: Texture | null }).map
      if (map) out.add(map)
    }
  })
  return out
}

/** 한 장이 실제로 나간 뒤에 부른다 (`scene/EngineDriver`) */
export function tickRetiredTextures(): void {
  if (retiring.length === 0) return
  let due = false
  for (const one of retiring) {
    one.left -= 1
    if (one.left <= 0) due = true
  }
  // 버릴 것이 하나도 차례가 안 됐으면 씬을 훑지 않는다
  if (!due) return
  const live = attached()
  for (let i = retiring.length - 1; i >= 0; i--) {
    const one = retiring[i]!
    if (one.left > 0) continue
    // 아직 무는 메시가 있다 — 버리면 그 메시가 죽은 그림을 제출한다
    if (live.has(one.tex)) {
      one.left = RECHECK_FRAMES
      continue
    }
    one.tex.dispose()
    retiring.splice(i, 1)
  }
}
