// BDSP 층(방 · 야외 지역 · 던전)이 **씬에 섰는가**를 적는 표
//
// 워프 덮개는 원작 지형이 섰는가만 기다렸다(`terrainMark`의 `terrainLanded`). 그런데 BDSP가 서는 맵에서는 원작 지형이 숨고
// (`ChunkModels`의 `dsHidden`) 그림은 BDSP glb가 맡는다 — glb는 따로 받고 풀어서 늦게 온다. 그래서 검은 덮개가 걷힌 뒤 하늘과
// 사람만 떠 있다가 몇백 ms ~ 몇 초 뒤 방이나 마을이 한꺼번에 튀어나왔다.
//
// 이 표는 그 사이를 잇는다. 그리는 쪽(`BdspRoom` · `BdspField` · `BdspDungeon`)이 제 씬을 붙이고 **한 프레임 그린 뒤**
// `markBdspReady`를 부르고, 못 세웠으면 `markBdspFailed`, 떼면 `forgetBdsp`를 부른다. 기다리는 쪽(`MapStreamer`)은 지금 원하는
// 열쇠를 `expectBdsp`로 알리고 `bdspSettled`로 묻는다.
//
// ⚠️ **열쇠는 목차의 이름 그대로다** — 방 `c01r0101` · 던전 `d27r0101` · 지역 `area001`. 세 목차의 이름은 서로 안 겹친다
// (`models/room` 117 · `models/dungeon` 138 · `models/field` 13을 견주어 겹침 0)
//
// ⚠️ **실패도 「섰다」로 센다.** 못 받은 glb를 기다리면 덮개가 안 걷힌다 — 그때는 원작 그림도 숨어 있지만 갇히는 것보다 낫다.
// 끝까지 안 오는 것은 `settleAsyncPipelines`의 상한이 끊는다

import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

type Status = 'ready' | 'failed'

const status = new Map<string, Status>()
let wanted: readonly string[] = []
let version = 0
const listeners = new Set<() => void>()

function changed(): void {
  version++
  for (const l of listeners) l()
}

/** 지금 그려야 할 BDSP 열쇠들을 알린다. 비우면 기다릴 것이 없다 */
export function expectBdsp(keys: readonly string[]): void {
  const next = [...new Set(keys)].sort()
  if (next.join() === wanted.join()) return
  wanted = next
  changed()
}

/** 그 씬이 붙어 한 프레임 그려졌다 */
export function markBdspReady(key: string): void {
  if (status.get(key) === 'ready') return
  status.set(key, 'ready')
  changed()
}

/** 그 씬을 못 세웠다 — 기다리지 말라 */
export function markBdspFailed(key: string): void {
  if (status.get(key) === 'failed') return
  status.set(key, 'failed')
  changed()
}

/** 그 씬을 뗐다. 다시 붙으면 다시 표시해야 한다 */
export function forgetBdsp(key: string): void {
  if (!status.has(key)) return
  status.delete(key)
  changed()
}

/** 알린 열쇠가 다 섰거나 실패했는가 */
export function bdspSettled(): boolean {
  return wanted.every((k) => status.has(k))
}

/** 이 열쇠의 씬이 서서 그려지고 있는가 (실패는 아니다) */
export function bdspReady(key: string): boolean {
  return status.get(key) === 'ready'
}

/** 이 열쇠의 씬을 못 세웠는가 — 받기 · 풀기가 실패해 그 자리가 비어 있다 */
export function bdspFailed(key: string): boolean {
  return status.get(key) === 'failed'
}

/** 표가 바뀔 때마다 부른다 — `useSyncExternalStore`의 구독 자리 */
export function subscribeBdsp(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** 표가 바뀐 횟수 — `useSyncExternalStore`의 스냅숏 자리 */
export function bdspVersion(): number {
  return version
}

/** 붙은 뒤 몇 프레임 그려야 「섰다」고 적는가. 붙은 그 프레임에는 아직 안 그려졌다 */
export const DRAWN_FRAMES = 2

/**
 * 그리는 쪽이 쓰는 표시 — 씬이 붙고 `DRAWN_FRAMES` 프레임이 지나면 섰다고, 못 세웠으면 실패라고 적고, 떼면 지운다.
 *
 * ⚠️ **붙자마자 적지 않는다.** 덮개가 걷히는 것과 첫 그림이 같은 프레임이면 파이프라인을 굽느라 그 프레임이 비어 보인다 —
 * 한 번 그린 뒤에 적어야 덮개 밑에서 굽는다 (`settleAsyncPipelines`)
 */
export function useBdspMark(key: string, attached: boolean, failed: boolean): void {
  const drawn = useRef(0)
  useEffect(() => { drawn.current = 0 }, [key, attached])
  useEffect(() => { if (failed) markBdspFailed(key) }, [key, failed])
  useEffect(() => () => { forgetBdsp(key) }, [key])
  useFrame(() => {
    if (!attached || status.has(key)) return
    drawn.current++
    if (drawn.current >= DRAWN_FRAMES) markBdspReady(key)
  })
}

/** 시험이 판을 비운다 */
export function resetBdspReady(): void {
  status.clear()
  wanted = []
  changed()
}
