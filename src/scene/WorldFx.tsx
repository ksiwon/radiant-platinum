// 한 번 터지는 월드 파티클 — 비전기술 · 눈덩이 깨짐 · 바위 파편 (docs/orders/GAPS_20261011.md A3 · A5)
//
// 엔진(`engine/actor` · `engine/script`)은 씬을 못 부르므로 `worldState.fxRequests`에 적어 두고 이 컴포넌트가 비운다. BDSP 프리팹이 구워져
// 있을 때만 세운다(`data/fx/index.json`의 `prefabs`) — 없는 설치본이면 요청을 버린다(원작 도형 연출이 그대로 돈다).
//
// ⚠️ **성능 규칙** — 한 번 돌고 끝나면 내린다(`onDone`). 형상은 `BdspEffect`의 통으로 돌아간다. 동시에 `MAX_LIVE`개를 넘기면 가장 오래된 것부터 버린다
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { assets } from '../data/providers/assetProvider'
import { worldState } from '../state/worldState'
import { BdspEffect } from './battle/fx/BdspEffect'

const MAX_LIVE = 6
/** 이만큼(초)이 지나야 끝난 것으로 친다 */
const MIN_LIFE = 0.5

let baked: Promise<ReadonlySet<string>> | null = null
/** 구워 둔 프리팹 이름들 (`data/fx/index.json`의 `prefabs`) — 없는 설치본이면 빈 집합 */
export function bakedFxPrefabs(): Promise<ReadonlySet<string>> {
  baked ??= assets().text('data/fx/index.json')
    .then((t) => new Set((JSON.parse(t) as { prefabs?: string[] }).prefabs ?? []))
    .catch(() => new Set<string>())
  return baked
}

interface Live { id: number, name: string, pos: [number, number, number], yaw: number }

let next = 1

export function WorldFx() {
  const [live, setLive] = useState<Live[]>([])
  const [have, setHave] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    let alive = true
    void bakedFxPrefabs().then((s) => { if (alive) setHave(s) })
    return () => { alive = false }
  }, [])
  useFrame(() => {
    const q = worldState.fxRequests
    if (q.length === 0) return
    const all = q.splice(0, q.length)
    const take = all.filter((r) => have.has(r.name))
    if (take.length === 0) return
    setLive((was) => [...was, ...take.map((r) => ({ id: next++, name: r.name, pos: [r.x, r.y, r.z] as [number, number, number], yaw: r.yaw }))].slice(-MAX_LIVE))
  })
  return <>
    {live.map((l) => <Once key={l.id} live={l} onDone={() => { setLive((was) => was.filter((w) => w.id !== l.id)) }} />)}
  </>
}

function Once({ live, onDone }: { live: Live, onDone: () => void }) {
  // 시계는 세워진 때부터 센다 — 배틀 시계는 필드에서 안 흐른다
  const start = useRef(performance.now())
  const clock = (): number => (performance.now() - start.current) / 1000
  // ⚠️ **`loop`로 세우고 첫 반 초의 `onDone`은 무시한다** — `BdspEffect`는 `play()` 앞에서 `done`일 수 있어(준비된 첫 프레임) 한 번짜리로 세우면 그 자리에서 끝난다.
  // 실제로 끝나면(반 초 뒤 첫 `done`) 내린다. 되풀이로 다시 시작하는 것은 내려가기 전 한 프레임이라 안 보인다
  // 개발 확인용: 주소에 `?fxhold`가 있으면 안 내린다(화면 확인 도구가 찍는 순간에 서 있게)
  const hold = typeof location !== 'undefined' && location.search.includes('fxhold')
  const done = (): void => { if (!hold && clock() >= MIN_LIFE) onDone() }
  return <BdspEffect name={live.name} position={live.pos} rotation={[0, live.yaw, 0]} seed={live.id} clock={clock} loop onDone={done} />
}
