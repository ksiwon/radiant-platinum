// 지역 · 방 · 던전에 서는 BDSP 파티클 — 폭포 · 분수 · 횃불 · 워프존 · 기계 불빛 · 해변 물결 (docs/orders/GAPS_20261011.md A)
//
// 굽는 쪽이 `FieldEffect`(`_effectId`)가 달린 물체를 메시 없는 노드(`fx:<번호>` · `userData.fx`)로 glb에 싣고(`import/bdsp/motion.ts`의
// `FX_NODE_PREFIX`), `data/fx/index.json`의 `fieldEffects`가 번호를 프리팹 이름으로 맺는다(`import/bdsp/fx.ts`). 이 컴포넌트가 가까운 표식 위에
// 배틀 이펙트와 같은 파티클 엔진(`BdspEffect`)을 세운다.
//
// ⚠️ **성능 규칙** — 화면 밖 · 먼 것은 안 민다. 반 초마다 플레이어에서 `REACH`칸 안의 표식만 골라(가까운 `MAX_LIVE`개까지) 세우고, 멀어지면 내린다
// (내린 이펙트의 형상은 `BdspEffect`의 통으로 돌아가 파이프라인이 산다). 시계는 이 컴포넌트가 쥔다 — 배틀 시계(`battleClock`)는 필드에서 안 흐른다
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Euler, Quaternion, Vector3, type Object3D } from 'three'
import { assets } from '../data/providers/assetProvider'
import { worldState } from '../state/worldState'
import { BdspEffect } from './battle/fx/BdspEffect'

/** 이 거리(칸) 안의 표식만 세운다 — 안개 끝 안쪽이다 */
export const FX_REACH = 70
/** 한 번에 세워 두는 최대 수 — 가까운 것부터 */
export const FX_MAX_LIVE = 12
const PICK_EVERY = 0.5

interface Marker {
  id: number
  pos: [number, number, number]
  rot: [number, number, number]
  scale: [number, number, number]
}

let table: Promise<Readonly<Record<string, string>>> | null = null
/** 번호 → 프리팹 이름 (`data/fx/index.json`의 `fieldEffects`). 없는 설치본이면 빈 표 — 그때는 파티클이 안 선다 */
function fieldEffectNames(): Promise<Readonly<Record<string, string>>> {
  table ??= assets().text('data/fx/index.json')
    .then((t) => (JSON.parse(t) as { fieldEffects?: Record<string, string> }).fieldEffects ?? {})
    .catch(() => ({}))
  return table
}

/** `root` 아래 파티클 표식들 — 월드 자리 · 회전 · 배율 (우리 장면 좌표) */
export function markersOf(root: Object3D): Marker[] {
  root.updateMatrixWorld(true)
  const out: Marker[] = []
  const p = new Vector3()
  const q = new Quaternion()
  const s = new Vector3()
  const e = new Euler()
  root.traverse((o) => {
    const id = o.userData.fx
    if (typeof id !== 'number') return
    o.matrixWorld.decompose(p, q, s)
    e.setFromQuaternion(q, 'XYZ')
    out.push({ id, pos: [p.x, p.y, p.z], rot: [e.x, e.y, e.z], scale: [s.x, s.y, s.z] })
  })
  return out
}

/** 이 자리에서 가까운 표식 `max`개 — `reach` 안에 든 것만 (`FX_REACH`) */
export function pickMarkers(markers: readonly Marker[], x: number, z: number, reach = FX_REACH, max = FX_MAX_LIVE): Marker[] {
  return markers
    .map((m) => ({ m, d: Math.hypot(m.pos[0] - x, m.pos[2] - z) }))
    .filter((r) => r.d <= reach)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((r) => r.m)
}

/** 같은 표식인가 — 가까운 목록이 안 바뀌면 다시 세우지 않는다 */
const keyOf = (m: Marker): string => `${String(m.id)}:${m.pos.map((v) => v.toFixed(2)).join(',')}`

export function FieldFx({ root, hidden = false }: { root: Object3D, hidden?: boolean }) {
  const [names, setNames] = useState<Readonly<Record<string, string>>>({})
  const [live, setLive] = useState<Marker[]>([])
  const all = useRef<Marker[]>([])
  const since = useRef(PICK_EVERY)
  useEffect(() => {
    let alive = true
    void fieldEffectNames().then((n) => { if (alive) setNames(n) })
    all.current = markersOf(root)
    since.current = PICK_EVERY
    return () => { alive = false }
  }, [root])
  useFrame((_, dt) => {
    since.current += dt
    if (since.current < PICK_EVERY || all.current.length === 0) return
    since.current = 0
    const p = worldState.player.position
    const next = hidden ? [] : pickMarkers(all.current.filter((m) => names[String(m.id)] !== undefined), p.x, p.z)
    setLive((was) => (was.length === next.length && was.every((m, i) => keyOf(m) === keyOf(next[i]!)) ? was : next))
  })
  return <>
    {live.map((m) => <FxAt key={keyOf(m)} marker={m} name={names[String(m.id)]!} />)}
  </>
}

/** 표식 하나 — 시계는 **세워진 때부터** 센다(`BdspEffect`의 `clock`은 재생 뒤 초다) */
function FxAt({ marker, name }: { marker: Marker, name: string }) {
  const start = useRef(performance.now())
  const clock = (): number => (performance.now() - start.current) / 1000
  return <BdspEffect name={name} position={marker.pos} rotation={marker.rot} scale={marker.scale} loop clock={clock} seed={marker.id} />
}
