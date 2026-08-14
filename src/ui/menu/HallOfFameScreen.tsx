// 명예의 전당 장면 (PARITY §7.11 · §8.11) — `cutscenes/hall_of_fame.c` · `clear_game.c`
//
// 리그를 이기면 이 화면이 뜨고, 끝나면 **게임이 타이틀로 돌아간다**
// (`OS_ResetSystem(RESET_CLEAN)`). 그 사이에 리포트가 한 번 자동으로 쓰인다.
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { music } from '../../engine/audio/music'
import { SFX } from '../../engine/audio/sfx'
import { genderOf, isShiny, type PokemonInstance } from '../../engine/pokemon/instance'
import { metName } from '../../engine/pokemon/memo'
import { metToday } from '../../engine/pokemon/origin'
import {
  addHallOfFameEntry,
  HALL_OF_FAME_PARTY,
  metKindNeedsPlace,
  metKindOf,
} from '../../engine/world/hallOfFame'
import { loadSpecies, loadSpeciesNames, type SpeciesTable } from '../../data/gameData'
import { assets, readJson } from '../../data/providers/assetProvider'
import { fillMenuText, HALL_OF_FAME_TEXT, loadUiText } from '../../data/uiText'
import { useGameLocale } from '../../state/optionsStore'
import { useMenuStore } from '../../state/menuStore'
import { useHallOfFameStageStore } from '../../state/hallOfFameStageStore'
import { START_LOCATION, useSaveStore } from '../../state/saveStore'
import { healParty } from '../../scene/pokecenter'
import * as css from './hallOfFame.css'

/** 전당의 곡 (`SEQ_BLD_EV_DENDO2`) */
const BGM = 1171

/** 화면 한 판. 원작 좌표를 그대로 쓴다 */
const W = 256
const H = 192
const x = (px: number): string => `${String((px / W) * 100)}%`
const y = (px: number): string => `${String((px / H) * 100)}%`

/** 한 컷의 크기와 판의 크기 (`POKEMON_FRAME_*` · `PLAYER_FRAME_HEIGHT`) */
const MON_FRAME = { w: 96, h: 128, top: 32, left: [24, 136] } as const
const PLAYER_FRAME = { left: 88, right: 168, top: 24, h: 144 } as const
/** 포켓몬 그림이 서는 자리 (`pokemonMovements`의 끝값 ÷ 4096) */
/** 글이 놓이는 칸 — 그림 반대쪽 136픽셀 (`monIndex & 1 ? 0 : 120`) */
const TEXT_X = [120, 0] as const
/** 줄 높이 (`ROW_HEIGHT`) */
const ROW = 16

/** 파티 여섯이 마지막에 서는 자리 (`endPositionsX` · `initialPositions`) */

/**
 * 무대 조명 여섯 (`ov86_0223CAA0` 여섯 번).
 *
 * 첫 값이 기울기고 둘째가 좌우 자리다. 기울기는 fx16이라 −0.714~0.714이고,
 * 자리는 화면 픽셀이다
 */

/** 색종이 마흔여덟 (`NUM_CONFETTI`) */

/**
 * 장면의 걸음. 밀리초는 원작의 프레임 수를 60fps로 옮긴 것이다 —
 * 미끄러지는 데 28프레임, 사이의 뜸이 20이나 30프레임이다
 */
type Beat =
  | 'fadeIn'
  | 'monIn'
  | 'monSettle'
  | 'monText1'
  | 'monText2'
  | 'monText3'
  | 'monHold'
  | 'monOut'
  | 'monGap'
  | 'playerIn'
  | 'playerHold'
  | 'expand'
  | 'playerText'
  | 'partyIn'
  | 'partyHold'
  | 'confetti'
  | 'wipe'
  | 'fadeOut'
  | 'saving'
  | 'saved'

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
}

export function HallOfFameScreen() {
  const locale = useGameLocale()
  const openCredits = useMenuStore((s) => s.openCredits)
  const [tables, setTables] = useState<Tables | null>(null)
  const [beat, setBeat] = useState<Beat>('fadeIn')
  const [at, setAt] = useState(0)
  const saved = useRef(false)

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

  useEffect(() => {
    const stage = useHallOfFameStageStore.getState()
    if (MON_BEATS.some(([name]) => name === beat)) {
      stage.setCeremony(beat === 'monOut' || beat === 'monGap' ? 'hidden' : 'solo', at)
    } else if (
      beat === 'playerIn' ||
      beat === 'playerHold' ||
      beat === 'expand' ||
      beat === 'playerText'
    ) {
      stage.setCeremony('player')
    } else if (beat === 'partyIn' || beat === 'partyHold' || beat === 'wipe') {
      stage.setCeremony('party')
    } else if (beat === 'confetti') stage.setCeremony('confetti')
    else stage.setCeremony('hidden')
  }, [beat, at])

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadSpecies(),
      loadSpeciesNames(locale),
      loadUiText('hallOfFame', locale),
      readJson(assets(), `data/names/locations.${locale}.json`) as Promise<string[]>,
      loadUiText('specialMetLocations', locale),
    ])
      .then(([species, names, text, location, special]) => {
        if (alive) setTables({ species, names, text, location, special })
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

  /** 리포트를 쓰고 전당에 한 줄을 남긴다 (`clear_game.c`의 상태 4) */
  const finish = useCallback((): void => {
    if (saved.current) return
    saved.current = true
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
      .then(() => {
        void music.playEffect(SFX.SAVE)
        setBeat('saved')
      })
      .catch(() => {
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
      ms = 400
      next = 'fadeOut'
    } else if (beat === 'fadeOut') {
      ms = frames(16)
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

  // A·B로 파티 장면을 끝낸다 (`gSystem.pressedKeys & (PAD_BUTTON_A | PAD_BUTTON_B)`),
  // 그리고 리포트를 다 쓴 뒤에도 한 번 더 누르면 타이틀로 간다
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyZ' && e.code !== 'KeyX' && e.code !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      if (beat === 'confetti') setBeat('wipe')
      else if (beat === 'saved') leave()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
    }
  }, [beat, leave])

  const mon = party[at]
  const side = at & 1

  const lines = useMemo(() => monLines(mon, tables, trainer), [mon, tables, trainer])

  const monPhase = MON_BEATS.some(([b]) => b === beat)
  const shown = monPhase && beat !== 'monOut' && beat !== 'monGap'
  const textAt =
    beat === 'monText1'
      ? 1
      : beat === 'monText2'
        ? 2
        : beat === 'monText3' || beat === 'monHold'
          ? 3
          : 0

  const finale = !monPhase && beat !== 'fadeIn'
  const expanded = finale && beat !== 'playerIn' && beat !== 'playerHold' && beat !== 'expand'
  const paneLeft = expanded ? 0 : PLAYER_FRAME.left
  const paneRight = expanded ? W : PLAYER_FRAME.right
  const wiping = beat === 'wipe' || beat === 'fadeOut' || beat === 'saving' || beat === 'saved'

  return (
    <div className={css.backdrop}>
      <div className={css.stage}>
        {/* 한 마리씩 */}
        {monPhase && mon && (
          <>
            <div
              className={css.pane}
              style={{
                left: x(shown ? MON_FRAME.left[side]! : side ? W : -MON_FRAME.w),
                top: y(MON_FRAME.top),
                width: x(MON_FRAME.w),
                height: y(MON_FRAME.h),
                transition: 'left 0.47s linear',
              }}
            />
            {lines.map((text, i) => (
              <div
                key={i}
                className={css.line}
                style={{
                  left: x(TEXT_X[side]!),
                  top: y(LINE_ROW[i]! * ROW),
                  opacity: LINE_STEP[i]! <= textAt ? 1 : 0,
                }}
              >
                {text}
              </div>
            ))}
          </>
        )}

        {/* 파티와 주인공 */}
        {finale && (
          <>
            <div
              className={css.pane}
              style={{
                left: x(paneLeft),
                top: y(PLAYER_FRAME.top),
                width: x(paneRight - paneLeft),
                height: y(PLAYER_FRAME.h),
                transition: 'left 0.2s linear, width 0.2s linear',
              }}
            />
            {(beat === 'playerText' ||
              beat === 'partyIn' ||
              beat === 'partyHold' ||
              beat === 'confetti' ||
              wiping) && (
              <>
                <div className={css.centerLine} style={{ top: y(4) }}>
                  {tables?.text[HALL_OF_FAME_TEXT.congratulations] ?? ''}
                </div>
                <div className={css.centerLine} style={{ top: y(172) }}>
                  {playerLine(tables, trainer)}
                </div>
              </>
            )}
          </>
        )}

        {/* 검게 닫히는 띠 둘 (24 → 96, 168 → 96). 닫힐 때만 글 위로 올라온다 */}
        <div
          className={css.wipe.top}
          style={{ height: y(wiping ? 96 : 24), zIndex: wiping ? 3 : 1 }}
        />
        <div
          className={css.wipe.bottom}
          style={{ height: y(wiping ? 96 : 24), zIndex: wiping ? 3 : 1 }}
        />

        <div
          className={css.fade}
          style={{ opacity: beat === 'fadeIn' || beat === 'fadeOut' ? 1 : 0 }}
        />

        {(beat === 'saving' || beat === 'saved') && (
          <div className={css.dialog}>
            {beat === 'saving'
              ? '리포트를 작성 중입니다…\n전원을 끄지 마세요.'
              : `${trainer.name || '???'}은(는) 리포트에 기록했다!`}
          </div>
        )}
        {beat === 'confetti' && <div className={css.hint}>Z 넘기기</div>}
        {beat === 'saved' && <div className={css.hint}>Z 계속</div>}
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
