// 낚시 (PARITY §1.5) — `src/overlay005/fishing.c`의 `sFishingActions`.
//
// **연출이 아니라 규칙이다.** 「!」가 뜨는 순간 A를 눌러야 하고, 그 창이
// 낚싯대마다 다르다. 그 창을 안 만들면 낚시는 "고르면 포켓몬이 나오는 버튼"이
// 되어 버린다 — 대단한 낚싯대가 어려운 이유가 통째로 사라진다.
//
// 프레임 단위로 적는다. 원작이 60fps에서 한 프레임에 한 번씩 이 표를 도는
// 상태 기계라, 초로 바꿔 적으면 창 길이가 반올림에서 흔들린다.
//
// ⚠️ **물릴지 말지는 던지기 전에 이미 정해져 있다.** 원작도 `FieldTask_Fishing`의
// 첫 단계에서 `WildEncounters_TryFishingEncounter`를 부르고, 그 참/거짓을
// 애니메이션에 넘긴다. 그래서 "안 물리는 날"은 기다림이 4초로 고정이다
import type { Rod } from '../battle/encounter'

/** 낚싯대를 던지는 동작. 34프레임째에 끝난다 (`FishingTask_CastRod`) */
export const CAST_FRAMES = 34
/** 던지고 10프레임째에 물소리 (`SEQ_SE_DP_FW104`) */
export const CAST_SOUND_FRAME = 10

/**
 * 「!」가 뜨기까지 기다리는 프레임 — `((LCRNG_Next() % 4) + 1) * 30`.
 *
 * 30·60·90·120 넷 중 하나다. 0.5초에서 2초 사이
 */
export const BITE_DELAY_STEP = 30
export const BITE_DELAY_CHOICES = 4

/**
 * 「!」가 뜬 뒤 A를 받아 주는 창 (`sRodTypeHookTimingWindow`).
 *
 * 45 · 30 · 15 프레임 — 0.75초 · 0.5초 · 0.25초다. **대단한 낚싯대가 제일
 * 짧다.** 좋은 것을 낚으려면 더 빨라야 한다는 것이 이 표의 전부다
 */
export const HOOK_FRAMES: Readonly<Record<Rod, number>> = {
  old: 45,
  good: 30,
  super: 15,
}

/** 안 물릴 때 기다리는 프레임 — `30 * 4`로 고정이다 */
export const NO_FISH_FRAMES = 120

/** 낚아 올리는 동작 (`FishingTask_ReelFishIn`은 15를 넘겨야 글을 띄운다) */
export const REEL_FRAMES = 16

/** 상태. 화면은 이 이름만 보고 그린다 */
export type FishingPhase =
  /** 던지는 중 */
  | 'cast'
  /** 찌를 보고 있다. 여기서 A를 누르면 너무 이르다 */
  | 'wait'
  /** 「!」가 떴다. **지금 A** */
  | 'bite'
  /** 낚아 올리는 중 */
  | 'reel'
  /** 글이 떠 있다. A나 B로 닫는다 */
  | 'message'
  /** 끝났다. `result`가 무엇으로 끝났는지 말한다 */
  | 'done'

export type FishingResult =
  /** 낚았다. 배틀로 넘어간다 */
  | 'caught'
  /** 「!」를 놓쳤다 — 도망가버렸다... */
  | 'away'
  /** 너무 일찍 당겼다 */
  | 'early'
  /** 애초에 안 물렸다 — 잡히지 않네... */
  | 'nothing'

/**
 * 낚시 한 판. 프레임을 먹여 돌린다.
 *
 * 순수한 값이라 시험이 화면 없이 창 길이를 잰다. 난수도 밖에서 받는다
 */
export interface FishingState {
  rod: Rod
  phase: FishingPhase
  /** 지금 단계에 남은/지난 프레임 */
  frames: number
  /** 「!」까지 남은 프레임. `wait`에서만 뜻이 있다 */
  delay: number
  result: FishingResult | null
  /** 물릴 운명인가. 던지기 전에 정해진다 */
  hooked: boolean
}

export function startFishing(rod: Rod, hooked: boolean, rng: () => number): FishingState {
  return {
    rod,
    phase: 'cast',
    frames: 0,
    delay: (Math.floor(rng() * BITE_DELAY_CHOICES) + 1) * BITE_DELAY_STEP,
    result: null,
    hooked,
  }
}

/** 이번 프레임에 무슨 소리를 낼 것인가. 화면이 이걸 보고 한 번만 울린다 */
export function castSounds(before: FishingState): boolean {
  return before.phase === 'cast' && before.frames + 1 === CAST_SOUND_FRAME
}

/**
 * 글을 띄우고 A나 B를 기다린다.
 *
 * ⚠️ **못 넘기는 시간은 없다.** `FishingTask_WaitCloseMessage`에 `counter < 16`
 * 검사가 있지만 들어오기 전에 셋 다 `counter = 16`으로 세워 놓고 오므로
 * 한 번도 안 걸린다 — 세어 보고 넣지 않으면 원작에 없는 지연이 생긴다
 */
function say(s: FishingState, result: FishingResult): FishingState {
  return { ...s, phase: 'message', frames: 0, result }
}

/**
 * 한 프레임 (`GoFish`).
 *
 * `pressedA`는 **이번 프레임에 새로 눌렸는가**다 (`TryPressA`는 눌린 순간만
 * 참이다). 누르고 있는 동안 계속 참이면 던지자마자 "너무 일렀다"가 된다.
 *
 * `closed`는 글을 닫는 A **또는 B**다 (`TryPressAOrB`)
 */
export function tickFishing(
  s: FishingState, pressedA: boolean, closed = pressedA,
): FishingState {
  switch (s.phase) {
    case 'cast': {
      const frames = s.frames + 1
      if (frames < CAST_FRAMES) return { ...s, frames }
      // 안 물리는 판은 기다림이 4초로 고정이다 (`FishingTask_SetNoFishWait`)
      return s.hooked
        ? { ...s, phase: 'wait', frames: 0 }
        : { ...s, phase: 'wait', frames: 0, delay: NO_FISH_FRAMES }
    }

    case 'wait': {
      // ⚠️ 누르는 판정이 **줄이는 것보다 먼저다.** 원작도 카운터를 내린 뒤
      // A를 보므로, 마지막 프레임에 누르면 "너무 일렀다"로 끝난다
      const delay = s.delay - 1
      if (pressedA) return say({ ...s, delay }, 'early')
      if (delay > 0) return { ...s, delay }
      // 안 물리는 판은 여기서 끝. 「!」가 아예 안 뜬다
      if (!s.hooked) return say({ ...s, delay }, 'nothing')
      return { ...s, delay, phase: 'bite', frames: HOOK_FRAMES[s.rod] }
    }

    case 'bite': {
      const frames = s.frames - 1
      // `FishingTask_CaughtFish`가 카운터를 0으로 되돌리고 감기로 넘긴다 —
      // 남은 창 프레임을 그대로 들고 가면 빨리 누를수록 오래 감는다
      if (pressedA) return { ...s, frames: 0, phase: 'reel', result: null }
      if (frames > 0) return { ...s, frames }
      return say({ ...s, frames }, 'away')
    }

    case 'reel': {
      const frames = s.frames + 1
      if (frames < REEL_FRAMES) return { ...s, frames }
      // 낚은 판은 잠금이 없다. 글이 뜨자마자 A를 받는다
      return { ...s, frames: 0, phase: 'message', result: 'caught' }
    }

    case 'message': {
      // `frames`는 글이 떠 있는 동안 올라간다. 화면이 이걸 보고 글자를 흘린다
      const frames = s.frames + 1
      return closed ? { ...s, frames, phase: 'done' } : { ...s, frames }
    }

    default:
      return s
  }
}

/**
 * 끝났을 때 띄우는 글. `dialogue/{로케일}/213.json`(공용 글묶음)의 자리다.
 *
 * ⚠️ **문장을 지어내지 않는다.** 원작이 `CommonStrings_Text_*`로 부르는 그
 * 네 줄이고, 번호는 `res/text/common_strings.json`의 차례다
 */
export const COMMON_STRINGS_BANK = 213
export const FISHING_TEXT: Readonly<Record<FishingResult, number>> = {
  /** CommonStrings_Text_NotEvenANibble */
  nothing: 54,
  /** CommonStrings_Text_ThePokemonGotAway */
  away: 55,
  /** CommonStrings_Text_ReeledItInTooQuickly */
  early: 56,
  /** CommonStrings_Text_LandedAPokemon */
  caught: 57,
}
