// 월드 로더 — Suspense로 감싸 쓴다.
// 캐시를 모듈 스코프에 두는 이유: R3F는 렌더 중 프라미스를 던져 다시 렌더하므로,
// 컴포넌트 상태에 두면 매 렌더마다 새 요청이 나간다.
import { MapStreamer } from './MapStreamer'
import { bootWorld, type WorldBoot } from './worldData'

type Entry =
  | { status: 'pending'; promise: Promise<void> }
  | { status: 'done'; boot: WorldBoot }
  | { status: 'error'; error: unknown }

let entry: Entry | null = null

function load(): WorldBoot {
  if (entry?.status === 'done') return entry.boot
  if (entry?.status === 'error') throw entry.error
  if (entry?.status === 'pending') throw entry.promise

  const promise = bootWorld()
    .then((boot) => { entry = { status: 'done', boot } })
    .catch((error) => { entry = { status: 'error', error } })
  entry = { status: 'pending', promise }
  throw promise
}

export function WorldLoader() {
  const boot = load()
  return (
    <MapStreamer
      initial={boot.overworld}
      spawn={boot.spawn}
      speciesNames={boot.speciesNames}
      locationNames={boot.locationNames}
    />
  )
}
