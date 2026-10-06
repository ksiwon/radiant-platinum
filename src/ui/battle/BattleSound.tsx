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
import { FRAME_SECONDS, battleClock } from '../../engine/battle/presentationClock'
import { STATUS_ANIMS } from '../../engine/battle/vfx'
import { ballOpen } from '../../scene/battle/stageRefs'
import { useBattleStore } from '../../state/battleStore'

/**
 * 지형 번쩍임 둘째 소리까지 (ms). **원작이 스물세 프레임에 낸다** —
 * `battle_display.c` 5342줄의 `frameCount == 23`이 그대로 이 값이다
 */
const FLASH2_DELAY = (23 / 60) * 1000
/** 쓰러진 뒤 울음소리를 얼마나 늦출지 (초). 소리 둘이 겹치면 둘 다 안 들린다 */
const FAINT_CRY_DELAY = 0.22

/**
 * 볼이 열리는 시각이 적히기를 기다리는 위끝(초).
 *
 * 시각은 무대(`BattleBallEffects`)가 같은 뷰를 보고 적는데, 그쪽 효과가 이쪽보다 늦게
 * 돌 수 있다. 무대가 없는 판(개발 콘솔로 타이틀에서 연 판)은 영영 안 적으므로 이만큼
 * 기다려도 없으면 곧바로 낸다
 */
const BALL_OPEN_GRACE = 0.2

/**
 * 경험치 게이지 소리의 최소 길이(초) — `expSoundTimer`가 8을 채우기 전에는 안 끊는다
 * (`battle_display.c`의 `Task_UpdateExpGauge`)
 */
const EXP_SOUND_MIN = 8 * FRAME_SECONDS

/**
 * 연출 시계가 `ready`를 참으로 만들 때 `fire`를 한 번 부른다. 돌려주는 함수로 거둔다.
 *
 * ⚠️ **벽시계(`setTimeout`)로 안 잰다.** 탭을 숨기면 연출 시계는 서는데 벽시계는
 * 흘러서, 돌아왔을 때 소리가 몸보다 먼저 났다 (`presentationClock`의 머리말)
 */
function whenClock(ready: (now: number) => boolean, fire: () => void): () => void {
  let raf = 0
  const frame = (): void => {
    if (ready(battleClock.now())) { fire(); return }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return () => { cancelAnimationFrame(raf) }
}

/**
 * @param drainMs 지금 박자의 게이지 길이(ms) — 재생기가 준다 (`useBattlePlayback`의 `holdMs`).
 *   경험치 바가 다 차는 시각을 여기서 읽는다
 */
export function BattleSound({ drainMs = 0 }: { drainMs?: number }) {
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
  /** 자리마다 기다리고 있는 소리. 마리가 바뀌거나 판이 끝나면 거둔다 */
  const waiting = useRef<Partial<Record<SlotId, () => void>>>({})
  // 야생·사파리 상대는 볼에서 안 나온다 — 기다릴 볼 시각이 없다 (`BattleBallEffects`)
  const kind = useBattleStore((s) => s.kind)
  const wildFoe = kind === 'wild' || kind === 'safari'
  const drain = useRef(drainMs)
  drain.current = drainMs

  // 배틀이 열리면 자주 나는 소리를 미리 편다 — 처음 낼 때 워커 합성을 기다리느라 25~52ms 늦었다(2026-10-06 실측)
  const open = phase !== 'off'
  useEffect(() => {
    if (!open) return
    void music.prewarm([
      SFX.BATTLE_FLASH, SFX.BATTLE_FLASH2, SFX.THROW, SFX.SEND_OUT, SFX.HIT_NORMAL, SFX.HIT_SUPER, SFX.HIT_WEAK, SFX.FAINT,
      SFX.EXP_GAIN, SFX.LEVEL_UP, SFX.FLEE, ...STAT_SOUNDS,
    ])
  }, [open])
  // 명부의 울음소리 — 등장하자마자 운다
  const species = useBattleStore((s) => Object.values(s.roster).map((r) => r.species).join(','))
  useEffect(() => {
    if (species === '') return
    void music.prewarmCries([...new Set(species.split(',').map(Number))])
  }, [species])
  useEffect(() => {
    if (phase !== 'off') return
    seen.current = blank()
    for (const cancel of Object.values(waiting.current)) cancel()
    waiting.current = {}
  }, [phase])
  // 화면이 내려가도 기다리던 소리를 거둔다
  useEffect(() => () => {
    for (const cancel of Object.values(waiting.current)) cancel()
    waiting.current = {}
  }, [])

  /**
   * 배틀이 열릴 때의 지형 번쩍임 둘 (`battle_display.c`의 `SysTask_SetupUI`).
   *
   * 원작이 화면을 세우면서 `PASA2`를 내고(5311줄) **스물세 프레임 뒤에**
   * `PASA3`을 낸다(5343줄이 `frameCount == 23`을 그대로 적어 두었다).
   *
   * ⚠️ **체력 바 소리가 아니다.** `Task_UpdateHPGauge`(4896줄)에는 `Sound_*`가
   * 한 줄도 없다 — 바가 줄어드는 소리를 붙이면 원작에 없는 것을 짓는 셈이다.
   *
   * ⚠️ **무대가 다 선 그 순간이다** (`battleStore`의 `sceneReady`). 원작도 화면을
   * **세울 때** 한 번이고, 우리 화면이 실제로 서는 자리가 여기다 — 준비 중에
   * 내면 아직 검은 막 뒤에서 소리만 난다
   */
  const sceneReady = useBattleStore((s) => s.sceneReady)
  useEffect(() => {
    if (!sceneReady) return
    void music.playEffect(SFX.BATTLE_FLASH)
    const id = setTimeout(() => { void music.playEffect(SFX.BATTLE_FLASH2) }, FLASH2_DELAY)
    return () => { clearTimeout(id) }
  }, [sceneReady])

  useEffect(() => {
    if (!view) return
    /** 그 자리에서 기다리던 소리를 거두고, 새로 기다릴 것을 건다 */
    const later = (slot: SlotId, cancel: (() => void) | null): void => {
      waiting.current[slot]?.()
      if (cancel === null) delete waiting.current[slot]
      else waiting.current[slot] = cancel
    }
    for (const slot of SLOTS) {
      const mon = view.active[slot]
      const was = seen.current[slot]
      if (!mon) { seen.current[slot] = { key: null, fainted: false }; continue }

      if (mon.key !== was.key) {
        // 새로 나왔다. 상대는 던지는 소리 없이 나타나고, 우리 쪽은 공을 던진다.
        // 공에서 나오는 소리는 양쪽 다 난다 — `battle_display.c` 2058줄이
        // 앞을 보든 뒤를 보든 `BOWA2`를 내고 좌우만 갈라 준다
        if (mon.side === 'p1') void music.playEffect(SFX.THROW)
        // 배운 말은 **내 쪽 페라페**만 쓴다 — 상대 전투원의 칸은 빈 녹음이다
        // (`FieldBattleDTO_CopyChatotCryToBattler(dto, 세이브의 것, BATTLER_PLAYER_1)`)
        const species = mon.species
        const defaultChatot = mon.side !== 'p1'
        const out = (): void => {
          void music.playEffect(SFX.SEND_OUT)
          if (species !== null) void music.playCry(species, { defaultChatot })
        }
        // ⚠️ **볼이 열릴 때 난다** (`stageRefs.ballOpen`). 던지는 순간에 같이 내면 볼이
        // 아직 날아가는 중에 「펑」과 울음이 겹치고, 몸이 나오는 순간에는 조용했다
        if (wildFoe && mon.side === 'p2') {
          later(slot, null)
          out()
        } else {
          const since = battleClock.now()
          later(slot, whenClock((now) => {
            const open = ballOpen[slot]
            // 이 등판의 시각인가 — 앞 등판이 남긴 시각은 지금보다 앞이다
            if (open !== undefined && open > since) return now >= open
            return now >= since + BALL_OPEN_GRACE
          }, () => { delete waiting.current[slot]; out() }))
        }
        seen.current[slot] = { key: mon.key, fainted: mon.presence === 'down' }
        continue
      }

      // ⚠️ **`fainted`가 아니라 `presence`다.** 숫자 HP는 게이지가 닳기 **전에**
      // 이미 0이라, 그 값으로 울리면 체력이 내려가기도 전에 기절 소리가 난다
      // (`engine/battle/view`의 `presence`)
      if (mon.presence === 'down' && !was.fainted) {
        void music.playEffect(SFX.FAINT)
        // 원작은 기절 울음을 3.5반음 내려서 낸다 (`POKECRY_FAINT`)
        if (mon.species !== null) {
          const species = mon.species
          const defaultChatot = mon.side !== 'p1'
          const at = battleClock.now() + FAINT_CRY_DELAY
          later(slot, whenClock((now) => now >= at, () => {
            delete waiting.current[slot]
            void music.playCry(species, { faint: true, defaultChatot })
          }))
        }
      }
      seen.current[slot] = { key: mon.key, fainted: mon.presence === 'down' }
    }
  }, [view, wildFoe])

  /**
   * 맞는 소리.
   *
   * ⚠️ **효과마다 다른 소리다.** 하나로 두면 굉장했는지 별로였는지가 귀로 안
   * 들린다 — 원작은 `effectiveness`로 갈라 세 소리를 쓴다
   * (`BattleDisplay_FlyMoveHitSoundEffect`)
   */
  // 도망쳤을 때. ⚠️ **잡았을 때의 소리는 여기서 안 낸다** — 판 상태는 볼을 던지는 순간 서므로 흔들기 전에 울렸다.
  // 흔들림이 끝난 박자가 낸다 (`victoryCue` · `SEQ_SE_DP_GETTING`)
  const outcome = useBattleStore((s) => s.outcome)
  useEffect(() => {
    if (outcome === 'fled') void music.playEffect(SFX.FLEE)
  }, [outcome])

  /**
   * 경험치와 레벨업 (`battle_display.c` 4928·5180줄).
   *
   * ⚠️ **원작은 바가 차는 동안 울리고 다 차면 끊는다** — 최소 8프레임을 보장한
   * 뒤 `Sound_StopEffect`다(4940·4951줄). 바(`BattleScreen`의 경험치 줄)는 박자의
   * 게이지 길이(`drainMs`) 동안 차므로, 그 시간이 지나면 끊는다. 레벨이 오른
   * 소리는 끊은 **뒤**다 (`Task_PlayLevelUpAnimation`)
   */
  const reward = view?.lastReward ?? null
  const lastRewardSeq = useRef(0)
  const expSound = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!reward || reward.seq === lastRewardSeq.current) return
    lastRewardSeq.current = reward.seq
    expSound.current?.()
    expSound.current = null
    const levelUp = reward.levelUp
    if (reward.exp <= 0) {
      if (levelUp) void music.playEffect(SFX.LEVEL_UP)
      return
    }
    void music.playEffect(SFX.EXP_GAIN)
    const since = battleClock.now()
    // 게이지 길이는 **기다리는 동안** 읽는다 — 뷰와 박자 길이는 같은 걸음에 오지만
    // 화면에 닿는 차례가 다를 수 있다
    expSound.current = whenClock(
      (now) => now >= since + Math.max(EXP_SOUND_MIN, drain.current / 1000),
      () => {
        expSound.current = null
        music.stopEffect(SFX.EXP_GAIN)
        if (levelUp) void music.playEffect(SFX.LEVEL_UP)
      },
    )
  }, [reward])
  useEffect(() => () => { expSound.current?.() }, [])

  // 맞는 소리는 몸이 움찔하는 프레임에 난다 — 박자가 기술 사건에 그 시각을 실어 보낸다(`strike` · DATA.md §2.18).
  // 시퀀스가 없는 기술(DS 연출)은 `strike`가 없어서 아래 게이지 자리에서 난다
  const cast = view?.lastMove ?? null
  useEffect(() => {
    const strike = cast?.strike
    if (!strike) return undefined
    const since = battleClock.now()
    return whenClock(
      (now) => now >= since + strike.at * FRAME_SECONDS,
      () => { void music.playEffect(HIT_SOUND[strike.level]) },
    )
  }, [cast])

  const hit = view?.lastHit ?? null
  const lastHitSeq = useRef(0)
  useEffect(() => {
    if (!hit || hit.seq === lastHitSeq.current) return
    lastHitSeq.current = hit.seq
    if (hit.voiced) return
    void music.playEffect(HIT_SOUND[hit.level])
  }, [hit])

  return null
}

/** 상태 이상 · 능력 변화 연출의 소리 — 처음 오를 때 160~186ms 늦었다(2026-10-06 실측) */
const STAT_SOUNDS = [...new Set(Object.values(STATUS_ANIMS).map((a) => a.sound.seq))]

const HIT_SOUND = {
  super: SFX.HIT_SUPER,
  resisted: SFX.HIT_WEAK,
  // 무효는 데미지가 없어서 여기까지 안 온다. 표를 다 채워 두는 것뿐이다
  immune: SFX.HIT_WEAK,
  normal: SFX.HIT_NORMAL,
} as const
