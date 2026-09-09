// 폼이 바뀌는 마디 (PARITY §3.4) — `applications/party_menu/form_change.c`
//
// 진화·부화와 같은 짜임이다. 상태 기계가 입자를 세우고 **정해진 프레임에 그림을
// 갈아 끼운 뒤**, 살아 있는 이미터가 0이 될 때까지 기다렸다가 울음소리를 내고
// 글을 찍는다 (`PartyMenuFormChange_ChangeForm`의 5~10번 상태).
//
//     기라티나  예순다섯 프레임째에 갈아 끼운다 · 이미터 셋
//     쉐이미    서른다섯 프레임째에 갈아 끼운다 · 이미터 둘
//
// ⚠️ **입자는 아직 안 그린다.** 원작은 파티 목록 **위에** 3D 입자를 얹는데
// (`DrawParticleSystem`이 BG0 위에 그린다) 우리 파티 화면은 DOM 창이고 공유
// 캔버스는 그 **뒤에** 있다 — 창에 구멍을 내면 갈아 끼우는 그 아이콘이 같이
// 사라진다. 여기서는 **박자와 갈아 끼우는 프레임**을 원작 값으로 맞추고, 입자를
// 올릴 층은 PLAN §16.10에 남겨 둔다. 자료는 이미 실려 있다
// (`particledata/pl_pokelist/pokelist_particle.narc` 두 멤버, `splPack`의
// `formChange` 묶음).
import { splLifeFrames } from '../battle/spl/emitter'
import type { SplFile } from '../battle/spl/resource'

/** `pokelist_particle`의 멤버 — 0이 기라티나 · 1이 쉐이미 */
export const FORM_MEMBER = { giratina: 0, shaymin: 1 } as const

/** 그 멤버에서 세우는 이미터 수 (`LoadParticleResources`) */
export const FORM_EMITTERS = { giratina: 3, shaymin: 2 } as const

interface FormChangeBeats {
  /** 그림을 갈아 끼우는 프레임 (`framesBeforeFormChange`) */
  readonly swap: number
  /** 입자가 다 죽는 프레임 — 여기서 울음소리가 난다 */
  readonly end: number
}

/**
 * 자료를 못 받았을 때 쓰는 값.
 *
 * ⚠️ **롬 실측이다** (`.audit/probe/formSpa.mjs`, 미국판). 기라티나 멤버의 자원 셋이
 * 76·77·75프레임이고 쉐이미의 둘이 83·63이다
 */
export const GIRATINA_BEATS: FormChangeBeats = { swap: 65, end: 77 }
export const SHAYMIN_BEATS: FormChangeBeats = { swap: 35, end: 83 }

/**
 * 마디를 **자료에서** 뽑는다.
 *
 * `swap`은 코드 상수라 자료에 없다 — 자료가 주는 것은 「언제 끝나는가」다
 * (`ParticleSystem_GetActiveEmitterCount() == 0`)
 */
export function formChangeBeats(swap: number, file: SplFile | null): FormChangeBeats {
  if (file === null) return { swap, end: swap + 12 }
  const life = file.resources.map((r) => splLifeFrames(r) ?? 0)
  // ⚠️ **끝은 `swap`보다 뒤여야 한다** — 원작 조건이 `elapsed > swap` **그리고**
  // 이미터가 다 죽었을 때다. 입자가 먼저 죽어도 갈아 끼우기를 기다린다
  return { swap, end: Math.max(swap + 1, Math.max(0, ...life)) }
}

/** 이 프레임에 이미 갈아 끼웠나 */
export function formChanged(frame: number, beats: FormChangeBeats): boolean {
  return frame >= beats.swap
}
