// 창기둥의 필드 연출 — 도는 한 벌 (`engine/world/spearPillarFx` · `ScrCmd_20D`)
//
// 원작은 필드의 연출 칸(`ov5_021D1B6C`)에 걸어 두고 **스크립트와 따로** 매 틱 돌린다 — 스크립트는 0으로 세운 뒤
// `WaitTime` · `PlaySE` · `PlayMusic`을 하고 나서야 1로 묻기 시작한다. 그래서 여기도 스크립트가 아니라 필드 틱이
// 민다 (`MapStreamer`의 `spearPillarFxTick`).
//
// 화면에는 둘을 쓴다 — 빨강은 비쳐 보이는 한 겹(`screenTint`), 검게 닫는 것은 페이드 덮개(`holdCover`).
// 사슬 모델은 `SpearPillarChain`이 그린다
import { chainCover, chainStart, chainTick, type ChainFx } from '../engine/world/spearPillarFx'
import { holdCover, screenTint } from '../engine/script/fade'
import { npcActors } from '../engine/actor/npcs'
import { world as mapWorld } from '../engine/map/world'

/** BG2 한 장의 색 (`demo_tengan_gra` 75 · 팔레트 6의 1번 = RGB555(27, 0, 0)) */
const RED = 'rgb(222, 0, 0)'
/** 사슬이 서는 사람 — 아카기 (`MapObjMan_LocalMapObjByIndex(…, 1)` · `LOCALID_CYRUS`) */
const CHAIN_OBJECT = 1

export const spearPillarLive: {
  chain: ChainFx | null
  /** 사슬이 선 자리(월드 칸) — 세울 때 한 번 잰다 (`MapObject_GetPosPtr`) */
  at: readonly [number, number, number] | null
  acc: number
} = { chain: null, at: null, acc: 0 }

/** 0 — 세운다 (`ov6_0223E6EC`) */
export function startRedChain(): void {
  spearPillarLive.chain = chainStart()
  spearPillarLive.acc = 0
  const who = npcActors.byLocalID.get(CHAIN_OBJECT)
  if (who) {
    const x = who.x + 0.5, z = who.z + 0.5
    spearPillarLive.at = [x, mapWorld.grid?.heightAtWorld(x, z) ?? who.y, z]
  } else spearPillarLive.at = null
}

/** 1 — 끝났는가. 끝났으면 거둔다 (`ov6_0223E708` · `ov6_0223E700`). 화면은 검게 덮인 채로 둔다 */
export function redChainDone(): boolean {
  const c = spearPillarLive.chain
  if (c === null) return true
  if (c.state !== 11) return false
  spearPillarLive.chain = null
  spearPillarLive.at = null
  screenTint.alpha = 0
  return true
}

/** 필드 한 프레임 — 틱을 세어 민다 */
export function spearPillarFxTick(dt: number): void {
  const c = spearPillarLive.chain
  if (c === null) return
  spearPillarLive.acc += Math.min(dt, 0.25) * 60
  let ticks = Math.floor(spearPillarLive.acc)
  spearPillarLive.acc -= ticks
  while (ticks-- > 0 && c.state !== 11) chainTick(c)
  const cover = chainCover(c)
  screenTint.alpha = cover.red
  screenTint.color = RED
  if (cover.black > 0) holdCover(cover.black)
}
