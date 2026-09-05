// 입자 묶음을 받아 두고 멤버를 꺼낸다.
//
// ⚠️ **쓰기 전에 미리 받는다.** `waza.bin`이 2.3MB인데 첫 기술이 나가는 순간에
// 받기 시작하면 그 한 번은 입자 없이 지나간다 — 배틀 시작부터 첫 수까지는 등장
// 연출만 해도 몇 초라 그 사이에 끝난다. 설치본에서는 OPFS에서 오므로 망을
// 아예 안 탄다.
//
// ⚠️ **읽은 것을 캐시한다.** 같은 기술을 두 번 쓰면 같은 `.spa`를 두 번 읽을
// 이유가 없고, 한 배틀에서 쓰는 멤버는 많아야 몇십 개다.
//
// ⚠️ **묶음이 하나가 아니다.** 기술은 `waza`지만 진화는 `evolve`고
// (PARITY §3.1), 알 부화·폼 변화도 제 묶음이 따로다 (DATA §2.28). 받는 길을
// 묶음마다 새로 짜면 캐시가 갈라지므로 **여기 하나로 모은다**.
import { loadParticles } from '../../data/gameData'
import { onProviderSwap } from '../../data/providers/assetProvider'
import { readSpa, type SplFile } from '../../engine/battle/spl/resource'

/** 기술 연출이 쓰는 묶음. 대본의 멤버 번호가 이 묶음의 번호다 */
export const SPL_WAZA = 'waza'
/** 진화 무대가 쓰는 묶음. 원작이 NARC를 **번호 124**로 부르는 그것이다 */
export const SPL_EVOLVE = 'evolve'
/** 알 부화가 쓰는 묶음 (`cutscenes/egg_hatch`) */
export const SPL_EGG = 'egg'

interface Held {
  pack: Awaited<ReturnType<typeof loadParticles>> | null
  loading: Promise<void> | null
  files: Map<number, SplFile>
}

const held = new Map<string, Held>()

function slot(group: string): Held {
  let at = held.get(group)
  if (at === undefined) {
    at = { pack: null, loading: null, files: new Map() }
    held.set(group, at)
  }
  return at
}

/** 쓰기 전에 한 번. 두 번 불러도 한 번만 받는다 */
export function preloadSplPack(group: string): Promise<void> {
  const at = slot(group)
  at.loading ??= loadParticles(group)
    .then((got) => {
      at.pack = got
    })
    .catch(() => {
      // 못 받으면 입자 없이 간다 — 부르는 쪽이 도형으로 되돌아간다.
      // 다음에 다시 해 볼 수 있게 자리를 비운다
      at.loading = null
    })
  return at.loading
}

/**
 * 멤버 하나. 아직 안 받았으면 `null`이다.
 *
 * ⚠️ **기다리지 않는다.** 기술이 나가는 그 프레임에 답이 나와야 해서 —
 * 없으면 그 한 번만 도형으로 간다
 */
export function splFileFor(group: string, member: number): SplFile | null {
  const at = slot(group)
  const hit = at.files.get(member)
  if (hit) return hit
  if (at.pack === null) return null
  const start = at.pack.at[member]
  const size = at.pack.size[member]
  if (start === undefined || size === undefined) return null
  const file = readSpa(at.pack.bytes.subarray(start, start + size))
  at.files.set(member, file)
  return file
}

/** 멤버 번호만 받는 자리에 꽂아 줄 읽개 (`moveAnimFrames`가 그렇다) */
export function splPackReader(group: string): (member: number) => SplFile | null {
  return (member) => splFileFor(group, member)
}

// 설치본을 갈아 끼우면 받아 둔 것도 버린다 — 옛 설치본의 바이트가 남는다
onProviderSwap(() => {
  held.clear()
})
