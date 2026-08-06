// 배틀 소리 (DATA.md §2.18)
//
// 화면(`view`)이 재생기가 밀어 주는 것이라 **거기서 소리를 딴다.** 정본(`truth`)을
// 보면 안 된다 — 그쪽은 늘 앞서 있어서 글이 뜨기도 전에 쓰러지는 소리가 난다.
//
// 울음소리는 곡이 아니라 **파형 창고**다. `Sound_PlayPokemonCry`가
// `NNS_SndArcPlayerStartSeqEx(…, waveID, …, SEQ_PV)`를 부르는데 `waveID`에
// 종족 번호가 그대로 들어간다 — SDAT의 `WAVE_ARC_PV001`이 색인 1이고 창고
// 1~494가 전부 표본 하나짜리다.
import { useEffect, useRef } from 'react'
import { music } from '../../engine/audio/music'
import { SFX } from '../../engine/audio/sfx'
import type { SideId } from '../../engine/battle/events'
import { useBattleStore } from '../../state/battleStore'

/** 쓰러진 뒤 울음소리를 얼마나 늦출지 (ms). 소리 둘이 겹치면 둘 다 안 들린다 */
const FAINT_CRY_DELAY = 220

export function BattleSound() {
  const view = useBattleStore((s) => s.view)
  const phase = useBattleStore((s) => s.phase)
  /** 쪽마다 마지막으로 본 개체와 쓰러짐 여부 */
  const seen = useRef<Record<SideId, { key: string | null; fainted: boolean }>>({
    p1: { key: null, fainted: false },
    p2: { key: null, fainted: false },
  })

  useEffect(() => {
    if (phase === 'off') {
      seen.current = { p1: { key: null, fainted: false }, p2: { key: null, fainted: false } }
    }
  }, [phase])

  useEffect(() => {
    if (!view) return
    for (const side of ['p1', 'p2'] as const) {
      const mon = view.active[side]
      const was = seen.current[side]
      if (!mon) { seen.current[side] = { key: null, fainted: false }; continue }

      if (mon.key !== was.key) {
        // 새로 나왔다. 상대는 던지는 소리 없이 나타나고, 우리 쪽은 공을 던진다
        if (side === 'p1') void music.playEffect(SFX.THROW)
        if (mon.species !== null) void music.playCry(mon.species)
        seen.current[side] = { key: mon.key, fainted: mon.fainted }
        continue
      }

      if (mon.fainted && !was.fainted) {
        void music.playEffect(SFX.FAINT)
        // 원작은 기절 울음을 3.5반음 내려서 낸다 (`POKECRY_FAINT`)
        if (mon.species !== null) {
          const species = mon.species
          setTimeout(() => { void music.playCry(species, { faint: true }) }, FAINT_CRY_DELAY)
        }
      }
      seen.current[side] = { key: mon.key, fainted: mon.fainted }
    }
  }, [view])

  return null
}
