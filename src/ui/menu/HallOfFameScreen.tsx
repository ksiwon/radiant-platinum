// 명예의 전당 장면 (PARITY §7.11 · §8.11) — `cutscenes/hall_of_fame.c` · `clear_game.c`
//
// 리그를 이기면 이 화면이 뜨고, 끝나면 **크레딧으로 넘어간다** (§8.12).
// 타이틀로 돌아가는 것(`OS_ResetSystem(RESET_CLEAN)`)은 그 뒤다 —
// 그 사이에 리포트가 한 번 자동으로 쓰인다.
//
// 원작의 상태 다섯을 그대로 따라간다 (`hallOfFameStates[]`):
//
//   밝아진다 → 한 마리씩 → 파티와 주인공 → 검게 닫힌다 → 어두워진다
//
// 그 뒤가 `clear_game.c`다: 파티를 다 회복시키고, 리포트를 쓰고, 전당에 한 줄을
// 남긴다.
//
// ⚠️ **깃발과 변수는 여기서 안 만진다.** 전당 방 스크립트가 이미 다 세우고
// (`PokemonLeagueHallOfFame_SetHallOfFameVictoryFlagsAndVars`), 나머지는
// `ClearGame` 명령이 화면을 열기 전에 한다 — 화면이 중간에 닫혀도 그 값들이
// 이미 저장돼 있어야 하기 때문이다.
//
// ⚠️ **끝나면 크레딧으로 넘어간다** (PARITY §8.12). 원작도 리포트를 쓴 뒤
// 오버레이 99를 띄우고 그것이 끝나야 타이틀로 간다 — 타이틀로 가는 것은
// `CreditsScreen`이 맡는다
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { music } from '../../engine/audio/music'
import { SFX } from '../../engine/audio/sfx'
import { genderOf, isShiny, type PokemonInstance } from '../../engine/pokemon/instance'
import { metName } from '../../engine/pokemon/memo'
import { metToday } from '../../engine/pokemon/origin'
import { fieldScripts } from '../../engine/script/field'
import {
  addHallOfFameEntry,
  HALL_OF_FAME_PARTY,
  metKindNeedsPlace,
  metKindOf,
} from '../../engine/world/hallOfFame'
import { loadSpecies, loadSpeciesNames, type SpeciesTable } from '../../data/gameData'
import { assets, readJson } from '../../data/providers/assetProvider'
import { fillMenuText, HALL_OF_FAME_TEXT, loadUiText, SAVE_TEXT } from '../../data/uiText'
import { useGameLocale } from '../../state/optionsStore'
import { useMenuStore } from '../../state/menuStore'
import { useHallOfFameStageStore } from '../../state/hallOfFameStageStore'
import { START_LOCATION, useSaveStore } from '../../state/saveStore'
import { healParty } from '../../scene/pokecenter'
import { HOF_FRAME_MS, hofTextLift, hofWindow, type HofBeat as Beat } from '../../scene/hallOfFameChoreo'
import * as css from './hallOfFame.css'

/** 전당의 곡 (`SEQ_BLD_EV_DENDO2`) */
const BGM = 1171

/** 화면 한 판. 원작 좌표를 그대로 쓴다 */
const W = 256
const H = 192
const x = (px: number): string => `${String((px / W) * 100)}%`
const y = (px: number): string => `${String((px / H) * 100)}%`

/** 글이 놓이는 칸 — 그림 반대쪽 136픽셀 (`monIndex & 1 ? 0 : 120`) */
const TEXT_X = [120, 0] as const
/** 줄 높이 (`ROW_HEIGHT`) */
const ROW = 16

/**
 * 장면의 걸음 (`hallOfFameChoreo`의 `HofBeat`). 밀리초는 원작의 프레임 수를 60fps로 옮긴 것이다 —
 * 미끄러지는 데 28프레임, 사이의 뜸이 20이나 30프레임이다
 */
const frames = (n: number): number => Math.round((n / 60) * 1000)

/** 한 마리를 보여 주는 동안의 차례와 길이 */
const MON_BEATS: readonly (readonly [Beat, number])[] = [
  ['monIn', frames(28)],
  ['monSettle', frames(20)],
  ['monText1', frames(20)],
  ['monText2', frames(20)],
  ['monText3', frames(30)],
  ['monHold', frames(30)],
  ['monOut', frames(28)],
  ['monGap', frames(30)],
]

/** 파티와 주인공을 보여 주는 차례 */
const FINALE_BEATS: readonly (readonly [Beat, number])[] = [
  ['playerIn', frames(28)],
  ['playerHold', frames(20)],
  ['expand', frames(12)],
  ['playerText', frames(20)],
  ['partyIn', frames(32)],
  ['partyHold', frames(20)],
]

interface Tables {
  species: SpeciesTable
  names: readonly string[]
  text: readonly string[]
  location: readonly string[]
  special: readonly string[]
  /** `TEXT_BANK_COMMON_STRINGS` — 리포트를 쓰는 동안과 쓴 뒤의 말 (`clear_game.c`) */
  common: readonly string[]
}

export function HallOfFameScreen() {
  const locale = useGameLocale()
  const openCredits = useMenuStore((s) => s.openCredits)
  const [tables, setTables] = useState<Tables | null>(null)
  const [beat, setBeat] = useState<Beat>('fadeIn')
  const [at, setAt] = useState(0)
  const saved = useRef(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [closing, setClosing] = useState(false)

  // ⚠️ **파티를 한 번만 집는다.** 마지막에 파티를 회복시키므로 그 뒤에 다시
  // 읽으면 화면의 HP가 장면 도중에 바뀐다. 알은 빼고 센다 (`MON_DATA_IS_EGG`)
  const [party] = useState<PokemonInstance[]>(() =>
    useSaveStore
      .getState()
      .party.filter((m) => !m.isEgg)
      .slice(0, HALL_OF_FAME_PARTY),
  )
  const trainer = useSaveStore((s) => s.trainer)
  useEffect(() => {
    const stage = useHallOfFameStageStore.getState()
    stage.startCeremony(
      party.map((member) => ({ species: member.species, form: member.form })),
      trainer.gender,
    )
    return () => {
      useHallOfFameStageStore.getState().clear()
    }
  }, [party, trainer.gender])

  useEffect(() => {
    if (!tables) return
    useHallOfFameStageStore.getState().setMons(
      party.map((member) => ({
        species: member.species,
        form: member.form,
        gender: genderOf(member.pid, tables.species.get(member.species).genderRatio),
        shiny: isShiny(member.pid, member.otId, member.otSecretId),
      })),
    )
  }, [party, tables])

  // 걸음을 3D 쪽에 알린다 — 둘이 같은 때(`since`)에서 원작 프레임을 센다
  useLayoutEffect(() => {
    useHallOfFameStageStore.getState().setCue(beat, at)
  }, [beat, at])

  // 창(`G2_SetWnd0Position`)과 글 판(BG1)의 자리를 프레임마다 원작 식으로 다시 쓴다
  const shade = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const { beat: now, since, selected } = useHallOfFameStageStore.getState()
      const frame = (performance.now() - since) / HOF_FRAME_MS
      const [l, t, r, b] = hofWindow(now, frame, selected & 1)
      if (shade.current) {
        // 바깥 네 점 다음 안쪽 네 점 — evenodd라 안쪽이 뚫린다. 창이 닫히면 구멍이 0이 되어 통째로 검다
        const px = (v: number): string => x(v), py = (v: number): string => y(v)
        const right = r <= l ? l : r, bottom = b <= t ? t : b
        shade.current.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${px(l)} ${py(t)}, ${px(right)} ${py(t)}, ${px(right)} ${py(bottom)}, ${px(l)} ${py(bottom)}, ${px(l)} ${py(t)})`
      }
      if (text.current) text.current.style.transform = `translateY(-${y(hofTextLift(now, frame))})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(),
      loadSpeciesNames(locale),
      loadUiText('hallOfFame', locale),
      readJson(assets(), `data/names/locations.${locale}.json`) as Promise<string[]>,
      loadUiText('specialMetLocations', locale),
      loadUiText('common', locale),
    ])
      .then(([species, names, text, location, special, common]) => {
        if (alive) setTables({ species, names, text, location, special, common })
      })
      .catch(() => {
        /* 글이 없어도 장면은 돈다 */
      })
    return () => {
      alive = false
    }
  }, [locale])

  useEffect(() => {
    void music.play(BGM)
  }, [])

  useEffect(() => {
    if (beat === 'fadeOut') music.fadeVolume(0, 30)
  }, [beat])

  /** 리포트를 쓰고 전당에 한 줄을 남긴다 (`clear_game.c`의 상태 4) */
  const finish = useCallback((): void => {
    if (saved.current) return
    saved.current = true
    // ⚠️ **스크립트가 세운 깃발을 먼저 스토어로 끌어온다** (`SaveScreen`과 같다). 안 그러면 `ClearGame`이 방금 세운
    // `FLAG_GAME_COMPLETED`와 전당 방 스크립트의 `VAR_PLAYER_HOUSE_POSTGAME_STATE`가 리포트에 안 들어가, 다시 켜면
    // 엔딩을 안 본 판이 된다 — 실측(탐침 p10): 리셋 뒤 이어하기에서 2404 꺼짐 · 16655 0 (REPAIR §131)
    useSaveStore.getState().commitScriptState(fieldScripts.vars.saved, fieldScripts.vars.flags)
    const store = useSaveStore.getState()
    // 원작 차례 그대로다 — 회복이 먼저, 그다음 저장, 그다음 전당 기록
    healParty()
    const record = addHallOfFameEntry(store.hallOfFame, store.party, metToday())
    useSaveStore.setState({ hallOfFame: record })
    // ⚠️ **자리를 떡잎마을 침실로 적어 저장한다.** 원작은 「특별한 자리」 칸에
    // 그걸 넣고 다음에 켤 때 그리로 워프시키는데(`SystemFlag_SetCommunicationClubAccessible`),
    // 결과가 같으므로 우리는 리포트의 자리를 바로 그리로 쓴다
    void useSaveStore
      .getState()
      .report(START_LOCATION)
      .then((got) => {
        // ⚠️ **`report`는 실패해도 안 던진다** — `saved: false`로 돌려준다. 결과를 안 보면 못 쓴
        // 리포트에도 「기록했다」가 뜨고, 사람은 엔딩이 남은 줄 알고 끈다
        if (!got.saved) {
          setSaveFailed(true)
          setBeat('saved')
          return
        }
        void music.playEffect(SFX.SAVE)
        setBeat('saved')
      })
      .catch(() => {
        setSaveFailed(true)
        setBeat('saved')
      })
  }, [])

  // 걸음을 하나씩 밟는다
  useEffect(() => {
    const monBeats = new Map(MON_BEATS)
    const finaleBeats = new Map(FINALE_BEATS)
    let ms: number | null = null
    let next: Beat = beat

    if (beat === 'fadeIn') {
      ms = frames(16)
      next = party.length > 0 ? 'monIn' : 'playerIn'
    } else if (monBeats.has(beat)) {
      ms = monBeats.get(beat)!
      const order = MON_BEATS.map(([b]) => b)
      const i = order.indexOf(beat)
      next = i + 1 < order.length ? order[i + 1]! : 'monIn'
    } else if (finaleBeats.has(beat)) {
      ms = finaleBeats.get(beat)!
      const order = FINALE_BEATS.map(([b]) => b)
      const i = order.indexOf(beat)
      next = i + 1 < order.length ? order[i + 1]! : 'confetti'
    } else if (beat === 'wipe') {
      ms = frames(24)
      next = 'fadeOut'
    } else if (beat === 'fadeOut') {
      // 밝기는 두 프레임에 내리고 곡이 30프레임에 잦아드는 것을 기다린다 (`HallOfFame_State_FadeOut`)
      ms = frames(30)
      next = 'saving'
    }

    if (ms === null) return
    const timer = setTimeout(() => {
      if (next === 'monIn' && beat === 'monGap') {
        // 다음 마리로. 마지막이었으면 파티 장면으로 넘어간다
        if (at + 1 < party.length) {
          setAt(at + 1)
          setBeat('monIn')
        } else setBeat('playerIn')
        return
      }
      setBeat(next)
    }, ms)
    return () => {
      clearTimeout(timer)
    }
  }, [beat, at, party.length])

  // 울음소리는 글이 뜨는 순간이다 (`HallOfFame_InitPokemonAnimation(…, playCry: TRUE)`)
  useEffect(() => {
    if (beat !== 'monText1') return
    const mon = party[at]
    // 페라페는 배운 말로 운다 — 리그의 전당은 `Sound_PlayPokemonCry`다(PC의 전당만 제 울음소리로 되돌린다)
    if (mon) void music.playCry(mon.species)
  }, [beat, at, party])

  // 리포트 쓰기와 타이틀로 돌아가기
  useEffect(() => {
    if (beat === 'saving') finish()
  }, [beat, finish])

  // 크레딧으로 넘어간다. 원작의 차례가 전당 → 리포트 → 크레딧 → 리셋이라
  // 타이틀로 가는 것은 크레딧이 맡는다 (PARITY §8.12)
  const leave = useCallback((): void => {
    music.stop()
    openCredits()
  }, [openCredits])

  // 다 쓰면 18프레임 쉬고 8프레임에 어두워진 뒤 크레딧으로 간다 — 누르기를 안 기다린다 (`clear_game.c` 상태 5~8)
  useEffect(() => {
    if (beat !== 'saved') return
    const dim = setTimeout(() => { setClosing(true) }, frames(18))
    const timer = setTimeout(leave, frames(18 + 8))
    return () => {
      clearTimeout(dim)
      clearTimeout(timer)
    }
  }, [beat, leave])

  // A·B로 파티 장면을 끝낸다 (`gSystem.pressedKeys & (PAD_BUTTON_A | PAD_BUTTON_B)`)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyZ' && e.code !== 'KeyX' && e.code !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      if (beat === 'confetti') setBeat('wipe')
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
    }
  }, [beat])

  const mon = party[at]
  const side = at & 1

  const lines = useMemo(() => monLines(mon, tables, trainer), [mon, tables, trainer])

  const monPhase = MON_BEATS.some(([b]) => b === beat)
  const textAt =
    beat === 'monText1'
      ? 1
      : beat === 'monText2'
        ? 2
        : beat === 'monText3' || beat === 'monHold' || beat === 'monOut'
          ? 3
          : 0
  const playerText =
    beat === 'playerText' || beat === 'partyIn' || beat === 'partyHold' || beat === 'confetti' ||
    beat === 'wipe' || beat === 'fadeOut'
  const common = tables?.common ?? []

  return (
    <div className={css.backdrop}>
      <div className={css.stage}>
        {/* BG2 — 창 밖을 덮는 검정 한 장. 창 자리만 뚫려 3D(배경 · 몸 · 조명 · 색종이)가 비친다 */}
        <div ref={shade} className={css.shade} />

        {/* BG1 — 한 마리분의 글. 그 마리가 나갈 때 판째 위로 걷힌다 */}
        <div ref={text} className={css.textPlane}>
          {monPhase && beat !== 'monGap' && mon && lines.map((line, i) => (
            <div
              key={i}
              className={css.line}
              style={{
                left: x(TEXT_X[side]!),
                top: y(LINE_ROW[i]! * ROW),
                opacity: LINE_STEP[i]! <= textAt ? 1 : 0,
              }}
            >
              {line}
            </div>
          ))}
          {/* 파티와 주인공 — 축하 인사와 주인공 정보는 창 밖 검정 위에 뜬다 */}
          {playerText && (
            <>
              <div className={css.centerLine} style={{ top: y(4) }}>
                {tables?.text[HALL_OF_FAME_TEXT.congratulations] ?? ''}
              </div>
              <div className={css.centerLine} style={{ top: y(172) }}>
                {playerLine(tables, trainer)}
              </div>
            </>
          )}
        </div>

        <div
          className={css.fade}
          style={{
            opacity: beat === 'fadeIn' || beat === 'fadeOut' || beat === 'saving' || beat === 'saved' ? 1 : 0,
            transitionDuration: beat === 'fadeOut' ? '33ms' : '267ms',
          }}
        />

        {/* 리포트 (`clear_game.c` — `CommonStrings_Text_SavingDontTurnOffThePower` · `_PlayerSavedTheGame`) */}
        {(beat === 'saving' || beat === 'saved') && (
          <div className={css.dialog} style={{ opacity: closing ? 0 : 1, transition: 'opacity 133ms linear' }}>
            {beat === 'saving'
              ? common[SAVE_TEXT.writing] ?? ''
              : saveFailed
                ? common[SAVE_TEXT.failed] ?? ''
                : fillMenuText(common[SAVE_TEXT.done] ?? '', [trainer.name])}
          </div>
        )}
      </div>
    </div>
  )
}

/** 다섯 줄이 놓이는 줄 번호 (`ROW_HEIGHT * n`) */
const LINE_ROW = [1, 2, 3, 4, 6, 7, 8] as const
/** 그 줄이 몇 번째 걸음에 뜨는가 */
const LINE_STEP = [1, 1, 2, 2, 3, 3, 3] as const

/**
 * 한 마리분의 일곱 줄.
 *
 * 원작 차례: 「전당등록을 축하합니다!」 두 줄 → 별명 → 종족·성별·레벨 →
 * 어버이 → 만난 자리 두 줄. 두 줄짜리 글은 `\n`으로 나뉘어 있고 원작도
 * 줄마다 따로 가운데 맞춤을 한다 (`String_CopyLineNum`)
 */
function monLines(
  mon: PokemonInstance | undefined,
  tables: Tables | null,
  trainer: { id: number; name: string },
): string[] {
  if (!mon || !tables) return []
  const text = (i: number): string => tables.text[i] ?? ''
  const welcome = text(HALL_OF_FAME_TEXT.welcome).split('\n')
  const species = tables.species.of(mon)
  const gender = genderOf(mon.pid, species.genderRatio)
  const slot = gender === 'male' ? 0 : gender === 'female' ? 1 : 2
  const speciesName = tables.names[mon.species] ?? ''
  const info = fillMenuText(text(HALL_OF_FAME_TEXT.info[slot]!), [speciesName, String(mon.level)])
  const ot = fillMenuText(text(HALL_OF_FAME_TEXT.ot), [mon.origin.otName])
  const kind = metKindOf(mon, trainer.id, trainer.name)
  const place = metKindNeedsPlace(kind)
    ? metName(mon.origin.met.location, {
        location: tables.location,
        special: tables.special,
        month: [],
      })
    : ''
  const met = fillMenuText(text(HALL_OF_FAME_TEXT.metAt + kind), [place]).split('\n')
  return [
    welcome[0] ?? '',
    welcome[1] ?? '',
    mon.nickname ?? speciesName,
    info,
    ot,
    met[0] ?? '',
    met[1] ?? '',
  ]
}

/** 아래 줄 — 이름·ID·플레이 시간 (`HallOfFame_Text_PlayerInfo`) */
function playerLine(
  tables: Tables | null,
  trainer: { name: string; id: number; playtimeMs: number },
): string {
  if (!tables) return ''
  const minutes = Math.floor(trainer.playtimeMs / 60000)
  return fillMenuText(tables.text[HALL_OF_FAME_TEXT.playerInfo] ?? '', [
    trainer.name,
    String(trainer.id).padStart(5, '0'),
    String(Math.floor(minutes / 60)),
    String(minutes % 60).padStart(2, '0'),
  ])
}

/** 파티 여섯의 앞모습. 한 장씩 받아 순서대로 담는다 */
