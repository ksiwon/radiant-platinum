// 번들 여럿을 한 자리에서 (IMPORT.md §12)
//
// ⚠️ **번들 하나가 자급자족이 아닌 것이 있다.** 포켓몬이 그렇다 — 배틀 프리팹에
// 재질·뼈대·동작이 있고 메시와 텍스처는 `pokemons/common` 쪽 번들 둘에 있다.
// 하나만 열면 "메시가 없다"로 끝나고, 그 종이 통째로 빠진다.
//
// ⚠️ **PathID를 파일 안에서만 찾으면 안 된다.** 여기서는 연 번들 전부를 한 지도로
// 묶는다 — 개발 추출기가 `UnityPy.load(*paths)`로 하는 것과 같은 것이다.
// PathID는 파일마다 새로 매기지만 64비트 난수라 실제로 겹치지 않는다. 겹치면
// **조용히 엉뚱한 것을 읽는 대신 세운다**.
import { className, openBundle, readSerializedFile, type Bundle, type SerializedFile, type UnityObject } from './unityfs'
import type { UnityValue } from './typetree'

export class EnvironmentError extends Error {
  constructor(message: string) { super(message); this.name = 'EnvironmentError' }
}

export interface Entry {
  object: UnityObject
  file: SerializedFile
  bundle: Bundle
  /** `CLASS_NAMES`의 이름, 모르면 `#번호` */
  type: string
}

export class Environment {
  readonly entries: Entry[] = []
  private readonly byPath = new Map<number, Entry>()
  private readonly cache = new Map<number, UnityValue | null>()

  /** 번들 바이트 하나를 연다. 여러 번 불러 겹쳐 쌓는다 */
  add(bytes: Uint8Array): void {
    const bundle = openBundle(bytes)
    for (const node of bundle.nodes) {
      // `.resS`는 자료 덩어리지 SerializedFile이 아니다
      if (/\.res[sS]$/.test(node.path)) continue
      let file: SerializedFile
      try {
        file = readSerializedFile(bundle.data.subarray(node.offset, node.offset + node.size))
      } catch { continue }
      for (const object of file.objects) {
        const entry: Entry = { object, file, bundle, type: className(object.classId) }
        const had = this.byPath.get(object.pathId)
        if (had) {
          // 같은 PathID가 둘이면 어느 쪽이 임자인지 알 수 없다. 짐작하지 않는다
          if (had.type !== entry.type) {
            throw new EnvironmentError(
              `PathID ${String(object.pathId)}가 겹친다 (${had.type} · ${entry.type})`,
            )
          }
          continue
        }
        this.byPath.set(object.pathId, entry)
        this.entries.push(entry)
      }
    }
  }

  ofType(type: string): Entry[] {
    return this.entries.filter((e) => e.type === type)
  }

  entryOf(pathId: number): Entry | null {
    return this.byPath.get(pathId) ?? null
  }

  /** 필드를 읽는다. 한 번 읽은 것은 들고 있는다 — 뼈 이름 하나에 여러 번 온다 */
  read(pathId: number): UnityValue | null {
    if (this.cache.has(pathId)) return this.cache.get(pathId) ?? null
    const e = this.byPath.get(pathId)
    const v = e ? e.file.read(e.object) : null
    this.cache.set(pathId, v)
    return v
  }

  readEntry(e: Entry): UnityValue | null {
    return this.read(e.object.pathId)
  }

  /** 그 오브젝트가 어느 번들에서 왔는가. 텍스처 스트림을 찾을 때 쓴다 */
  bundleOf(pathId: number): Bundle | null {
    return this.byPath.get(pathId)?.bundle ?? null
  }
}

/** 번들 바이트 여럿을 한 환경으로 */
export function openEnvironment(bundles: readonly Uint8Array[]): Environment {
  const env = new Environment()
  for (const b of bundles) env.add(b)
  if (env.entries.length === 0) throw new EnvironmentError('번들에서 오브젝트를 하나도 못 읽었다')
  return env
}
