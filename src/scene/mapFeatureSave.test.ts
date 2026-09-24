// 체육관 장치가 **이어하기로 되살아나는가** (REPAIR §78 · `PersistedMapFeatures`)
//
// 원작은 이어하기에서 장치 버퍼를 안 지우고 `OnTransition`을 안 돌린다 — 세이브에 담긴 상태
// 그대로 선다. 우리는 장치마다 「지금 상태를 꺼낸다(`*Snapshot`) → 그 값으로 세운다(`init*`의
// `saved`)」를 두었다. 여기서 잠그는 것은 **그 둘이 같은 상태를 낸다**는 것이다
import { beforeEach, describe, expect, it } from 'vitest'
import { PASTORIA_BUTTON, PASTORIA_BUTTON_MODEL, PASTORIA_GYM_MAP, PASTORIA_WATER } from '../engine/world/pastoriaGym'
import { CANALAVE_GYM_MAP, CANALAVE_PLATFORMS } from '../engine/world/canalaveGym'
import { VEILSTONE_BAGS, VEILSTONE_GYM_MAP } from '../engine/world/veilstoneGym'
import { SUNYSHORE_BUTTON, SUNYSHORE_GYM_MAPS } from '../engine/world/sunyshoreGym'
import { worldState } from '../state/worldState'
import {
  initPastoriaGym, pastoriaBusy, pastoriaPressed, pastoriaSnapshot, pastoriaTick, pastoriaWaterHeight,
  pressPastoriaButton, resetPastoriaGym,
} from './pastoriaGym'
import {
  canalaveBusy, canalavePlatformTile, canalaveSnapshot, canalaveStepped, canalaveTick, initCanalaveGym,
  resetCanalaveGym,
} from './canalaveGym'
import {
  hitVeilstoneBag, initVeilstoneGym, resetVeilstoneGym, veilstoneBagAt, veilstoneBusy, veilstoneSnapshot,
  veilstoneTick,
} from './veilstoneGym'
import {
  initSunyshoreGym, pressSunyshoreButton, resetSunyshoreGym, sunyshoreSnapshot, sunyshoreState,
} from './sunyshoreGym'

beforeEach(() => {
  resetPastoriaGym()
  resetCanalaveGym()
  resetVeilstoneGym()
  resetSunyshoreGym()
})

describe('들판 체육관 — 누른 단추', () => {
  it('주황을 눌러 물을 내린 상태가 이어하기로 그대로 선다', () => {
    initPastoriaGym(PASTORIA_GYM_MAP)
    expect(pastoriaPressed()).toBe(PASTORIA_BUTTON.green)
    pressPastoriaButton(PASTORIA_BUTTON_MODEL.orange)
    for (let i = 0; i < 1000 && pastoriaBusy(); i++) pastoriaTick(1 / 60)
    const saved = pastoriaSnapshot()
    expect(saved).toEqual([PASTORIA_BUTTON.orange])
    resetPastoriaGym()
    initPastoriaGym(PASTORIA_GYM_MAP, saved!)
    expect(pastoriaPressed()).toBe(PASTORIA_BUTTON.orange)
    expect(pastoriaWaterHeight()).toBe(PASTORIA_WATER.low)
  })

  it('세이브 값이 없으면(워프로 들어오면) 초록에서 시작한다', () => {
    initPastoriaGym(PASTORIA_GYM_MAP)
    expect(pastoriaWaterHeight()).toBe(PASTORIA_WATER.middle)
  })
})

describe('운하 체육관 — 판 비트', () => {
  it('밟아서 옮긴 판이 이어하기로 옮긴 자리에 선다', () => {
    initCanalaveGym(CANALAVE_GYM_MAP)
    const i = 4 // (24, 0, 13) — 0층에서 1층으로 오르는 판
    const [x, y, z] = canalavePlatformTile(i)!
    worldState.player.position.set(x! + 0.5, y!, z! + 0.5)
    expect(canalaveStepped()).toBe(true)
    // 움직이는 중에 적어도 목적지 비트다
    const saved = canalaveSnapshot()
    for (let k = 0; k < 2000 && canalaveBusy(); k++) canalaveTick(1 / 60)
    expect(canalaveSnapshot()).toEqual(saved)
    const moved = canalavePlatformTile(i)
    expect(moved).toEqual([...CANALAVE_PLATFORMS[i]!.b])
    resetCanalaveGym()
    initCanalaveGym(CANALAVE_GYM_MAP, saved!)
    expect(canalavePlatformTile(i)).toEqual(moved)
  })
})

describe('장막 체육관 — 샌드백 자리와 선 타이어', () => {
  it('찬 샌드백이 이어하기로 멈춘 자리에 선다 — 미끄러지는 중에 적어도', () => {
    initVeilstoneGym(VEILSTONE_GYM_MAP)
    let kicked = -1
    for (const [index, [bx, bz]] of VEILSTONE_BAGS.entries()) {
      for (let dir = 0; dir < 4 && kicked < 0; dir++) {
        if (hitVeilstoneBag(bx, bz, dir) && veilstoneBusy()) kicked = index
      }
      if (kicked >= 0) break
    }
    expect(kicked).toBeGreaterThanOrEqual(0)
    const midSlide = veilstoneSnapshot()
    for (let k = 0; k < 2000 && veilstoneBusy(); k++) veilstoneTick(1 / 60)
    const settled = veilstoneSnapshot()
    expect(midSlide).toEqual(settled)
    const at = veilstoneBagAt(kicked)
    resetVeilstoneGym()
    initVeilstoneGym(VEILSTONE_GYM_MAP, settled!)
    expect(veilstoneBagAt(kicked)).toEqual(at)
    expect(veilstoneSnapshot()).toEqual(settled)
  })

  it('모양이 안 맞는 값이면 처음 자리로 선다', () => {
    initVeilstoneGym(VEILSTONE_GYM_MAP, [1, 2, 3])
    expect(veilstoneBagAt(0)).toEqual([...VEILSTONE_BAGS[0]!])
  })
})

describe('물가 체육관 — 회전 상태', () => {
  it('돌린 상태가 이어하기로 그대로 선다', () => {
    const map = SUNYSHORE_GYM_MAPS[0]!
    initSunyshoreGym(map, 0)
    const before = sunyshoreState()
    pressSunyshoreButton(SUNYSHORE_BUTTON.normal)
    const saved = sunyshoreSnapshot()
    expect(saved).not.toEqual([before])
    resetSunyshoreGym()
    initSunyshoreGym(map, 0, saved!)
    expect(sunyshoreState()).toBe(saved![0])
  })
})
