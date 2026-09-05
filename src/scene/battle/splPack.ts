// 기술 입자 묶음을 받아 두고 멤버를 꺼낸다.
//
// ⚠️ **배틀에 들어설 때 미리 받는다.** `waza.bin`이 2.3MB인데 첫 기술이 나가는
// 순간에 받기 시작하면 그 한 번은 입자 없이 지나간다 — 배틀 시작부터 첫 수까지는
// 등장 연출만 해도 몇 초라 그 사이에 끝난다. 설치본에서는 OPFS에서 오므로
// 망을 아예 안 탄다.
//
// ⚠️ **읽은 것을 캐시한다.** 같은 기술을 두 번 쓰면 같은 `.spa`를 두 번 읽을
// 이유가 없고, 한 배틀에서 쓰는 멤버는 많아야 몇십 개다.
import { loadParticles } from '../../data/gameData'
import { onProviderSwap } from '../../data/providers/assetProvider'
import { readSpa, type SplFile } from '../../engine/battle/spl/resource'

/** 기술 연출이 쓰는 묶음. 대본의 멤버 번호가 이 묶음의 번호다 */
const GROUP = 'waza'

const files = new Map<number, SplFile>()
let pack: Awaited<ReturnType<typeof loadParticles>> | null = null
let loading: Promise<void> | null = null

/** 배틀에 들어설 때 한 번. 두 번 불러도 한 번만 받는다 */
export function preloadSplPack(): Promise<void> {
  loading ??= loadParticles(GROUP)
    .then((got) => {
      pack = got
    })
    .catch(() => {
      // 못 받으면 입자 없이 간다 — 부르는 쪽이 도형으로 되돌아간다.
      // 다음에 다시 해 볼 수 있게 자리를 비운다
      loading = null
    })
  return loading
}

/**
 * 멤버 하나. 아직 안 받았으면 `null`이다.
 *
 * ⚠️ **기다리지 않는다.** 기술이 나가는 그 프레임에 답이 나와야 해서 —
 * 없으면 그 한 번만 도형으로 간다
 */
export function splFileFor(member: number): SplFile | null {
  const hit = files.get(member)
  if (hit) return hit
  if (pack === null) return null
  const at = pack.at[member]
  const size = pack.size[member]
  if (at === undefined || size === undefined) return null
  const file = readSpa(pack.bytes.subarray(at, at + size))
  files.set(member, file)
  return file
}

// 설치본을 갈아 끼우면 받아 둔 것도 버린다 — 옛 설치본의 바이트가 남는다
onProviderSwap(() => {
  files.clear()
  pack = null
  loading = null
})
