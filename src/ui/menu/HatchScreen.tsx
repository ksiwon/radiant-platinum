// 부화 장면 (PARITY §3.2) — `src/egg_hatch.c` · `cutscenes/egg_hatch/main.c`.
//
// 원작 차례 그대로다 (`EggHatchCutscene_Normal`):
//
//   화면이 밝아지면 곡(`SEQ_SHINKA`)            ← 흔들리는 동안 글은 없다
//   흔들림 넷마다 `EGG01`, 터질 때 `BOWA3`      ← 마디는 `engine/pokemon/hatchBeat`
//   태어난 마리가 울고 「알이 부화해서 …」       ← 여기서 도감에 오른다
//   다 울면 팡파르(`SEQ_FANFA5`), 끝나면
//   「별명을 지어주겠습니까?」 예/아니오          ← 예면 이름 짓기 화면으로 잇는다
//
// 알이 터지고 나서의 장면은 **흰 막 속**에서 선다 (`egg_hatch/main.c:512-576`): 알이 사라지고 10프레임 뒤 위아래 검은 띠가
// 프레임당 4줄씩 걷히고 흰 막이 16걸음에 서며, 새 몸이 그 속에 나타나 25프레임 머문 뒤 16걸음에 걷힌다 (`hatchBeat`의
// `hatchBars` · `hatchVeil`). 그 박자가 끝나야 새 몸이 울고 이름표가 뜬다. 이름 짓기로 넘기기 전에는 **검게** 16프레임이다.
//
// **글은 전부 부화 뱅크(`TEXT_BANK_EGG_HATCH`)의 것이다.** 한동안 「어라!?」와 「축하합니다! ○○가
// 태어났다!」를 지어 띄웠다 — 앞의 것은 진화 쪽 말이고 뒤의 것은 롬에 없는 문장이다.
//
// 별명은 원작도 컷신이 아니라 **필드 과제**가 이어서 연다 (`FieldTask_HatchEgg`의 3·4) — 컷신을 닫고
// 이름 짓기 화면(`NameScreen`)을 연 뒤, 화면이 닫히면 답을 넣고 기록을 하나 올린다.
//
// ⚠️ **친밀도가 종족 기본값이 아니라 120이다.** 규칙은 `breeding.ts`가 갖고,
// 여기는 그 함수를 부르기만 한다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadDialogueBank, loadSpecies, loadSpeciesNames, type SpeciesTable } from '../../data/gameData'
import { fillMenuText } from '../../data/uiText'
import { music } from '../../engine/audio/music'
import { fieldBgm } from '../../engine/audio/songs'
import { hatch } from '../../engine/pokemon/breeding'
import { genderOf, isShiny } from '../../engine/pokemon/instance'
import { mapById } from '../../engine/map/world'
import { addRecord } from '../../engine/world/gameRecords'
import { useSessionStore } from '../../state/sessionStore'
import { useHatchStore } from '../../state/hatchStore'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import {
  EGG_BEATS, EGG_HATCH_BANK, EGG_HATCH_TEXT, HATCH_SOUND, hatchBars, hatchSoundCues, hatchVeil,
} from '../../engine/pokemon/hatchBeat'
import { useCinematicStore } from '../../state/cinematicStore'
import { useSaveStore } from '../../state/saveStore'
import { MessageWindow } from '../common/MessageWindow'
import { NamePlate } from '../common/MonIdentity'
import { windowArrow } from '../common/parts.css'
import { YesNo } from '../common/YesNo'
import { naming } from './namingAnswer'
import { MenuScreen } from './MenuScreen'
import * as own from './evolutionScreen.css'


/**
 * 알이 흔들리다 깨져서 새 몸이 흰 막 속에 서기까지 걸리는 시간.
 *
 * ⚠️ **우리가 고른 수가 아니다.** 원작은 스물다섯 프레임을 가만히 있다가
 * 흔들림 넷(한 벌 열 프레임)을 돌리고, 조각 이미터가 **다 죽어야** 터진다 —
 * 그 길이를 `.spa`가 정한다 (`engine/pokemon/hatchBeat`). 한동안 1,400ms였다.
 *
 * ⚠️ **무대와 같은 마디표를 본다** — 3D 쪽은 자료에서 뽑은 마디를 쓰고 여기는
 * 실측 상수를 쓰는데, 시험(`hatchBeat.test.ts`)이 둘이 같은 수임을 못박는다
 *
 * ⚠️ **알이 사라지는 프레임(`hide`)이 아니라 흰 막이 다 서는 프레임(`reveal`)이다** — 새 몸은 그 막 속에서 나타난다
 */
const SHAKE_MS = (EGG_BEATS.reveal / 60) * 1000
/** 흰 막이 다 걷히는 때 — 새 몸은 이 뒤에 운다 */
const END_MS = (EGG_BEATS.end / 60) * 1000

const FRAME_MS = 1000 / 60

/** `constants/string.h`의 `MON_NAME_LEN` */
const MON_NAME_LEN = 10
/** `RECORD_POKEMON_NICKNAMED` (`generated/game_records.txt`의 50째 줄) — 별명을 지으면 하나 오른다 (`FieldTask_HatchEgg`의 4) */
const RECORD_POKEMON_NICKNAMED = 49

/**
 * `shaking` 흔들린다 · `born` 태어났다(흰 막이 걷히고 울음 → 팡파르를 기다린다) · `text` 「알이 부화해서…」가 떠 있다
 * (팡파르가 끝나길 기다린다) · `ask` 별명을 묻는다 · `leaving` 검게 16프레임
 */
type Stage = 'shaking' | 'born' | 'text' | 'ask' | 'leaving'

/** `cond`가 참이 되면 `then`을 부른다. 걷는 함수를 돌려준다 (원작이 매 프레임 묻는 자리) */
function when(cond: () => boolean, then: () => void): () => void {
  const id = setInterval(() => {
    if (!cond()) return
    clearInterval(id)
    then()
  }, FRAME_MS)
  return () => { clearInterval(id) }
}

export function HatchScreen() {
  const locale = useGameLocale()
  const [names, setNames] = useState<string[] | null>(null)
  const [species, setSpecies] = useState<SpeciesTable | null>(null)
  const [bank, setBank] = useState<readonly string[] | null>(null)
  const [stage, setStage] = useState<Stage>('shaking')
  /** 태어난 마리의 이름표를 띄우나 — 흰 막이 다 걷힌 뒤다. 흔들리는 동안은 화면에 글자가 하나도 없다 */
  const [plate, setPlate] = useState(false)
  const slot = useHatchStore((s) => s.slot)
  const close = useHatchStore((s) => s.close)
  const party = useSaveStore((s) => s.party)
  const mon = slot >= 0 ? party[slot] : undefined
  /** 이름 짓기 화면을 열어 둔 자리. 화면이 닫히면 답을 이 자리에 넣는다 */
  const namingSlot = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    loadSpeciesNames(locale)
      .then((got) => {
        if (alive) setNames(got)
      })
      .catch(() => {
        /* 이름 없이도 장면은 돈다 */
      })
    void loadDialogueBank(locale, EGG_HATCH_BANK)
      .then((got) => {
        if (alive) setBank(got)
      })
      .catch(() => {
        /* 뱅크가 없으면 글 없이 돌고 별명은 안 묻는다 */
      })
    return () => {
      alive = false
    }
  }, [locale])

  useEffect(() => {
    let alive = true
    void loadSpecies()
      .then((got) => {
        if (alive) setSpecies(got)
      })
      .catch(() => {
        /* 성별·색이 없을 뿐 장면은 돈다 */
      })
    return () => {
      alive = false
    }
  }, [])

  /** 알을 실제로 깬다. 여기서만 세이브가 바뀐다 */
  const born = useCallback((): void => {
    const store = useSaveStore.getState()
    const at = store.party[slot]
    if (!at || !at.isEgg) {
      useCinematicStore.getState().finishHatch()
      setStage('born')
      return
    }
    const next = [...store.party]
    // 만난 자리는 **깬 자리**다. 맵 번호가 아니라 지역명 번호를 넘긴다
    next[slot] = hatch(at, mapById(useSessionStore.getState().mapId)?.label ?? 0)
    useSaveStore.setState({ party: next })
    store.markSeen(at.species)
    store.markCaught(at.species)
    setStage('born')
    useCinematicStore.getState().finishHatch()
  }, [slot])

  useEffect(() => {
    if (slot < 0 || stage !== 'shaking') return
    // ⚠️ **무대와 같은 시계에서 센다.** 이 화면이 먼저 서고 `startHatch`가 그
    // 뒤에 돌므로, 붙은 자리에서 재면 무대보다 **먼저** 깨진다 — 실측으로
    // 알이 97프레임이 아니라 75프레임에 사라졌다 (`cinematicStore`의 `startedAt`)
    const at = useCinematicStore.getState().startedAt
    const elapsed = at > 0 ? performance.now() - at : 0
    const timer = setTimeout(born, Math.max(0, SHAKE_MS - elapsed))
    // 흔들림 넷과 터짐 하나 (`hatchSoundCues`). 이미 지난 소리는 다시 안 낸다
    const cues = hatchSoundCues(EGG_BEATS).flatMap((cue) => {
      const wait = (cue.frame * 1000) / 60 - elapsed
      if (wait < -FRAME_MS) return []
      return [setTimeout(() => { void music.playEffect(cue.seq) }, Math.max(0, wait))]
    })
    return () => {
      clearTimeout(timer)
      for (const id of cues) clearTimeout(id)
    }
  }, [slot, stage, born])

  // 흰 막이 다 걷히면 태어난 마리가 운다 (`Sound_PlayPokemonCry` · main.c 132) — 이름표도 이때 뜬다. 다 울면 팡파르(142),
  // 팡파르가 끝나야 별명을 묻는다 (`Sound_IsBGMPausedByFanfare`)
  useEffect(() => {
    if (slot < 0 || stage !== 'born') return
    const at = useCinematicStore.getState().startedAt
    const elapsed = at > 0 ? performance.now() - at : 0
    let stop = (): void => { /* 아직 안 걸렸다 */ }
    const timer = setTimeout(() => {
      setPlate(true)
      const kind = useSaveStore.getState().party[slot]?.species
      if (kind !== undefined) void music.playCry(kind)
      stop = when(() => !music.isCryPlaying(), () => {
        void music.playEffect(HATCH_SOUND.fanfare)
        // 팡파르와 함께 「알이 부화해서…」가 뜬다
        setStage('text')
      })
    }, Math.max(0, END_MS - elapsed))
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, [slot, stage])

  useEffect(() => {
    if (slot < 0 || stage !== 'text') return
    return when(() => !music.isEffectPlaying(HATCH_SOUND.fanfare), () => { setStage('ask') })
  }, [slot, stage])

  // 곡은 장면이 서 있는 동안만 가로챈다 — 들어올 때의 가로채기를 쥐고 있다가 나갈 때 돌려놓는다.
  // ⚠️ **`music.play`를 직접 안 부른다.** 곡을 고르는 자리가 하나뿐이라(`MusicDirector`) 다음 초에 맵 곡이 덮는다
  useEffect(() => {
    if (slot < 0) return
    const before = fieldBgm.override
    fieldBgm.override = HATCH_SOUND.bgm
    return () => { fieldBgm.override = before }
  }, [slot])

  // 자리가 바뀌면 처음부터
  useEffect(() => {
    if (slot < 0) {
      useCinematicStore.getState().clear()
      return
    }
    const at = useSaveStore.getState().party[slot]
    setStage('shaking')
    setPlate(false)
    if (at)
      useCinematicStore.getState().startHatch({
        species: at.species,
        form: at.form,
        gender: species ? genderOf(at.pid, species.get(at.species).genderRatio) : undefined,
        shiny: isShiny(at.pid, at.otId, at.otSecretId),
      })
  }, [slot, species])

  useEffect(
    () => () => {
      useCinematicStore.getState().clear()
    },
    [],
  )

  /**
   * 이름 짓기 화면이 닫히면 답을 넣는다 (`FieldTask_HatchEgg`의 4).
   *
   * 화면이 답을 `naming.answer`에 두고 닫힌다 — 스크립트가 여는 별명과 같은 길이다. **빈 이름은 지나간 것**이다
   * (Esc · `NAMING_SCREEN_CODE_OK`가 아닌 자리)
   */
  useEffect(() => useMenuStore.subscribe((now) => {
    const at = namingSlot.current
    if (at === null || now.stack.includes('naming')) return
    namingSlot.current = null
    const got = naming.answer
    naming.answer = null
    if (got === null || got.kind !== 'pokemon' || got.slot !== at || got.name === '') return
    useSaveStore.getState().renameMon(at, got.name)
    useSaveStore.setState((s) => ({ records: addRecord(s.records, RECORD_POKEMON_NICKNAMED) }))
  }), [])

  /**
   * 예/아니오를 골랐다. B는 아니오다 (`MENU_CANCEL` → `nicknameMon = FALSE`).
   *
   * 곧장 닫지 않고 **검게 16프레임** 어두워진 뒤에 넘어간다 (`:201-208`) — 한동안 태어난 마리가 한 프레임에 사라지고
   * 이름 짓기가 열렸다
   */
  const answer = useCallback((nickname: boolean): void => {
    if (stage !== 'ask') return
    const at = slot
    const kind = useSaveStore.getState().party[at]?.species ?? 0
    setStage('leaving')
    setTimeout(() => {
      useCinematicStore.getState().clear()
      close()
      if (!nickname) return
      naming.answer = null
      namingSlot.current = at
      useMenuStore.getState().openNaming({
        kind: 'pokemon',
        slot: at,
        // 깬 마리는 아직 별명이 없다 — 물음(「○○의 이름은?」)이 종족 이름을 쓴다
        initial: names?.[kind] ?? '',
        max: MON_NAME_LEN,
      })
    }, 16 * FRAME_MS)
  }, [stage, slot, close, names])

  // 뱅크를 못 받았으면 물을 글이 없다 — 그때는 묻지 않고 닫는다
  useEffect(() => {
    if (stage === 'ask' && bank === null) answer(false)
  }, [stage, bank, answer])

  const line = useMemo(() => {
    if (stage === 'shaking' || stage === 'born' || stage === 'leaving' || bank === null) return ''
    const name = names?.[mon?.species ?? 0] ?? ''
    const at = stage === 'text' ? EGG_HATCH_TEXT.hatched : EGG_HATCH_TEXT.nickname
    return fillMenuText(bank[at] ?? '', [name])
  }, [stage, bank, names, mon])

  if (slot < 0) return null

  const hatched = mon !== undefined && !mon.isEgg
  return (
    <MenuScreen title="알" cinematic bare>
      <div className={own.stage}>
        <HatchFrame black={stage === 'leaving'} />
        {plate && hatched && (
          <div className={own.plate}>
            <NamePlate
              to={names?.[mon.species] ?? ''}
              gender={species ? genderOf(mon.pid, species.get(mon.species).genderRatio) : undefined}
              level={mon.level}
            />
          </div>
        )}
        {line !== '' && stage !== 'leaving' && (
          <div className={own.dock}>
            <MessageWindow
              lines={line}
              yesNo={stage === 'ask' && bank !== null
                ? (
                  <div className={own.yesNoSlot}>
                    <YesNo
                      labels={[bank[EGG_HATCH_TEXT.yes] ?? '', bank[EGG_HATCH_TEXT.no] ?? '']}
                      initial={0}
                      onPick={answer}
                    />
                  </div>
                )
                : undefined}
            />
            {stage === 'text' && <span className={windowArrow} aria-hidden>▼</span>}
          </div>
        )}
      </div>
    </MenuScreen>
  )
}

/**
 * 위아래 검은 띠 · 흰 막 · 검은 막 — 모두 프레임마다 `ref`로 민다 (진화의 `EvolutionFrame`과 같은 까닭).
 *
 * 띠는 처음부터 서 있다가(위 32줄 · 아래 48줄 = 화면의 1/6 · 1/4) 알이 사라지고 10프레임 뒤 걷힌다.
 * 흰 막은 그 사이 16걸음에 서서 새 몸이 머무는 25프레임 동안 서 있다 걷힌다. **같은 시계**를 3D 무대와 나눈다
 * (`cinematicStore`의 `startedAt`)
 */
function HatchFrame({ black }: { black: boolean }) {
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const veilRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const at = useCinematicStore.getState().startedAt
      const frame = at > 0 ? Math.max(0, ((performance.now() - at) * 60) / 1000) : 0
      const bars = hatchBars(frame, EGG_BEATS)
      if (topRef.current) topRef.current.style.height = `${String(bars.top * 100)}%`
      if (bottomRef.current) bottomRef.current.style.height = `${String(bars.bottom * 100)}%`
      if (veilRef.current) veilRef.current.style.opacity = String(hatchVeil(frame, EGG_BEATS))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  return (
    <div className={own.screenFrame} aria-hidden>
      <div ref={topRef} className={`${own.clampBar} ${own.clampTop}`} />
      <div ref={bottomRef} className={`${own.clampBar} ${own.clampBottom}`} />
      <div ref={veilRef} className={own.veil} />
      <div className={black ? `${own.blackVeil} ${own.blackVeilOn}` : own.blackVeil} />
    </div>
  )
}
