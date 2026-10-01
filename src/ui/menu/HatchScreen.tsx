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
  EGG_BEATS, EGG_HATCH_BANK, EGG_HATCH_TEXT, HATCH_SOUND, hatchSoundCues,
} from '../../engine/pokemon/hatchBeat'
import { useCinematicStore } from '../../state/cinematicStore'
import { useSaveStore } from '../../state/saveStore'
import { naming } from './namingAnswer'
import { useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as dialog from './dialog.css'
import * as own from './evolutionScreen.css'


/**
 * 알이 흔들리다 깨지는 데 걸리는 시간.
 *
 * ⚠️ **우리가 고른 수가 아니다.** 원작은 스물다섯 프레임을 가만히 있다가
 * 흔들림 넷(한 벌 열 프레임)을 돌리고, 조각 이미터가 **다 죽어야** 터진다 —
 * 그 길이를 `.spa`가 정한다 (`engine/pokemon/hatchBeat`). 한동안 1,400ms였다.
 *
 * ⚠️ **무대와 같은 마디표를 본다** — 3D 쪽은 자료에서 뽑은 마디를 쓰고 여기는
 * 실측 상수를 쓰는데, 시험(`hatchBeat.test.ts`)이 둘이 같은 수임을 못박는다
 */
const SHAKE_MS = (EGG_BEATS.hide / 60) * 1000

const FRAME_MS = 1000 / 60

/** `constants/string.h`의 `MON_NAME_LEN` */
const MON_NAME_LEN = 10
/** `RECORD_POKEMON_NICKNAMED` (`generated/game_records.txt`의 50째 줄) — 별명을 지으면 하나 오른다 (`FieldTask_HatchEgg`의 4) */
const RECORD_POKEMON_NICKNAMED = 49

/**
 * `shaking` 흔들린다 · `born` 태어났다(울음 → 팡파르를 기다린다) · `ask` 별명을 묻는다
 */
type Stage = 'shaking' | 'born' | 'ask'

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
  /** 예/아니오 커서. 원작 메뉴는 「예」에서 선다 */
  const [yes, setYes] = useState(true)
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

  // 태어나면 운다 (`Sound_PlayPokemonCry` · main.c 132). 다 울면 팡파르(142), 팡파르가 끝나야
  // 별명을 묻는다 (`Sound_IsBGMPausedByFanfare`)
  useEffect(() => {
    if (slot < 0 || stage !== 'born') return
    const kind = useSaveStore.getState().party[slot]?.species
    if (kind !== undefined) void music.playCry(kind)
    let stop = when(() => !music.isCryPlaying(), () => {
      void music.playEffect(HATCH_SOUND.fanfare)
      stop = when(() => !music.isEffectPlaying(HATCH_SOUND.fanfare), () => {
        setYes(true)
        setStage('ask')
      })
    })
    return () => { stop() }
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

  /** 예/아니오를 골랐다. B는 아니오다 (`MENU_CANCEL` → `nicknameMon = FALSE`) */
  const answer = useCallback((nickname: boolean): void => {
    if (stage !== 'ask') return
    const at = slot
    const kind = useSaveStore.getState().party[at]?.species ?? 0
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
  }, [stage, slot, close, names])

  useMenuKeys({
    up: () => { if (yes) return false; setYes(true); return true },
    down: () => { if (!yes) return false; setYes(false); return true },
    confirm: () => { answer(yes) },
    cancel: () => { answer(false) },
  }, stage === 'ask')

  // 뱅크를 못 받았으면 물을 글이 없다 — 그때는 묻지 않고 닫는다
  useEffect(() => {
    if (stage === 'ask' && bank === null) answer(false)
  }, [stage, bank, answer])

  const line = useMemo(() => {
    if (stage === 'shaking' || bank === null) return ''
    const name = names?.[mon?.species ?? 0] ?? ''
    const at = stage === 'born' ? EGG_HATCH_TEXT.hatched : EGG_HATCH_TEXT.nickname
    return fillMenuText(bank[at] ?? '', [name])
  }, [stage, bank, names, mon])

  if (slot < 0) return null

  return (
    <MenuScreen title="알" foot={stage === 'ask' ? '↑↓ 고르기 · Z 결정 · X 아니오' : ''}>
      <div className={own.stage}>
        <div className={own.cinematicSpace} aria-hidden />
        <div className={own.line} style={{ whiteSpace: 'pre-line' }}>{line}</div>
        {stage === 'ask' && bank !== null && (
          <div className={dialog.choices}>
            <span className={yes ? dialog.choiceOn : dialog.choice} onClick={() => { answer(true) }}>
              {bank[EGG_HATCH_TEXT.yes] ?? ''}
            </span>
            <span className={yes ? dialog.choice : dialog.choiceOn} onClick={() => { answer(false) }}>
              {bank[EGG_HATCH_TEXT.no] ?? ''}
            </span>
          </div>
        )}
      </div>
    </MenuScreen>
  )
}
