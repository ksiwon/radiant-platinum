// 존 JSON 로더 — Suspense로 감싸 쓴다.
// 캐시를 모듈 스코프에 두는 이유: R3F는 렌더 중 프라미스를 던져 다시 렌더하므로,
// 컴포넌트 상태에 두면 매 렌더마다 새 요청이 나간다.
import { ZoneBlockout } from './ZoneBlockout'
import type { ZoneData } from '../engine/map/zone'

type Entry = { status: 'pending'; promise: Promise<void> } | { status: 'done'; data: ZoneData } | { status: 'error'; error: unknown }

const cache = new Map<string, Entry>()

function load(name: string): ZoneData {
  const hit = cache.get(name)
  if (hit?.status === 'done') return hit.data
  if (hit?.status === 'error') throw hit.error
  if (hit?.status === 'pending') throw hit.promise

  const promise = fetch(`${import.meta.env.BASE_URL}data/zones/${name}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`존 ${name} 로드 실패: HTTP ${r.status}`)
      return r.json() as Promise<ZoneData>
    })
    .then((data) => { cache.set(name, { status: 'done', data }) })
    .catch((error) => { cache.set(name, { status: 'error', error }) })

  cache.set(name, { status: 'pending', promise })
  throw promise
}

export function ZoneLoader({ name }: { name: string }) {
  return <ZoneBlockout zone={load(name)} />
}
