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
import { SLOTS, type SlotId } from '../../engine/battle/events'
import { useBattleStore } from '../../state/battleStore'

/** 쓰러진 뒤 울음소리를 얼마나 늦출지 (ms). 소리 둘이 겹치면 둘 다 안 들린다 */
const FAINT_CRY_DELAY = 220

export function BattleSound() {
  const view = useBattleStore((s) => s.view)
  const phase = useBattleStore((s) => s.phase)
  /**
   * **자리마다** 마지막으로 본 개체와 쓰러짐 여부.
   *
   * ⚠️ 쪽으로 세면 더블에서 둘째 마리의 등장·기절 소리가 통째로 안 난다 —
   * 첫째와 키를 비교하게 되어 "이미 본 애"로 걸러진다
   */
  const blank = (): Record<SlotId, { key: string | null; fainted: boolean }> => ({
    p1a: { key: null, fainted: false }, p1b: { key: null, fainted: false },
    p2a: { key: null, fainted: false }, p2b: { key: null, fainted: false },
  })
  const seen = useRef(blank())

  useEffect(() => {
    if (phase === 'off') seen.current = blank()
  }, [phase])

  useEffect(() => {
    if (!view) return
    for (const slot of SLOTS) {
      const mon = view.active[slot]
      const was = seen.current[slot]
      if (!mon) { seen.current[slot] = { key: null, fainted: false }; continue }

      if (mon.key !== was.key) {
        // 새로 나왔다. 상대는 던지는 소리 없이 나타나고, 우리 쪽은 공을 던진다.
        // 공에서 나오는 소리는 양쪽 다 난다 — `battle_display.c` 2058줄이
        // 앞을 보든 뒤를 보든 `BOWA2`를 내고 좌우만 갈라 준다
        if (mon.side === 'p1') void music.playEffect(SFX.THROW)
        void music.playEffect(SFX.SEND_OUT)
        if (mon.species !== null) void music.playCry(mon.species)
        seen.current[slot] = { key: mon.key, fainted: mon.fainted }
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
      seen.current[slot] = { key: mon.key, fainted: mon.fainted }
    }
  }, [view])

  /**
   * 맞는 소리.
   *
   * ⚠️ **효과마다 다른 소리다.** 하나로 두면 굉장했는지 별로였는지가 귀로 안
   * 들린다 — 원작은 `effectiveness`로 갈라 세 소리를 쓴다
   * (`BattleDisplay_FlyMoveHitSoundEffect`)
   */
  // 잡았을 때와 도망쳤을 때. 배틀이 끝나는 방식마다 소리가 다르다
  const outcome = useBattleStore((s) => s.outcome)
  useEffect(() => {
    if (outcome === 'caught') void music.playEffect(SFX.CAUGHT)
    if (outcome === 'fled') void music.playEffect(SFX.FLEE)
  }, [outcome])

  const hit = view?.lastHit ?? null
  const lastHitSeq = useRef(0)
  useEffect(() => {
    if (!hit || hit.seq === lastHitSeq.current) return
    lastHitSeq.current = hit.seq
    void music.playEffect(HIT_SOUND[hit.level])
  }, [hit])

  return null
}

const HIT_SOUND = {
  super: SFX.HIT_SUPER,
  resisted: SFX.HIT_WEAK,
  // 무효는 데미지가 없어서 여기까지 안 온다. 표를 다 채워 두는 것뿐이다
  immune: SFX.HIT_WEAK,
  normal: SFX.HIT_NORMAL,
} as const
