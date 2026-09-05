// 부화 장면 (PARITY §3.2) — `src/egg_hatch.c`.
//
// 원작이 하는 것이 셋이다:
//
//   어라!?                          ← 알이 흔들린다
//   축하합니다! ○○가 태어났다!      ← 여기서 도감에 오른다
//   (별명을 지을지 묻는다)
//
// 별명 화면은 우리에게도 있으므로(`NameScreen`) 그 자리를 그대로 잇는다.
//
// ⚠️ **친밀도가 종족 기본값이 아니라 120이다.** 규칙은 `breeding.ts`가 갖고,
// 여기는 그 함수를 부르기만 한다
import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadSpecies, loadSpeciesNames, type SpeciesTable } from '../../data/gameData'
import { hatch } from '../../engine/pokemon/breeding'
import { genderOf, isShiny } from '../../engine/pokemon/instance'
import { mapById } from '../../engine/map/world'
import { useSessionStore } from '../../state/sessionStore'
import { useHatchStore } from '../../state/hatchStore'
import { useGameLocale } from '../../state/optionsStore'
import { EGG_BEATS } from '../../engine/pokemon/hatchBeat'
import { useCinematicStore } from '../../state/cinematicStore'
import { useSaveStore } from '../../state/saveStore'
import { withSubject } from '../korean'
import { useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
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

type Stage = 'shaking' | 'born'

export function HatchScreen() {
  const locale = useGameLocale()
  const [names, setNames] = useState<string[] | null>(null)
  const [species, setSpecies] = useState<SpeciesTable | null>(null)
  const [stage, setStage] = useState<Stage>('shaking')
  const slot = useHatchStore((s) => s.slot)
  const close = useHatchStore((s) => s.close)
  const party = useSaveStore((s) => s.party)
  const mon = slot >= 0 ? party[slot] : undefined

  useEffect(() => {
    let alive = true
    loadSpeciesNames(locale)
      .then((got) => {
        if (alive) setNames(got)
      })
      .catch(() => {
        /* 이름 없이도 장면은 돈다 */
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
        /* ?? ???? ??? ?? ?? */
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
    const left = at > 0 ? Math.max(0, SHAKE_MS - (performance.now() - at)) : SHAKE_MS
    const timer = setTimeout(born, left)
    return () => {
      clearTimeout(timer)
    }
  }, [slot, stage, born])

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

  const done = useCallback((): void => {
    if (stage !== 'born') return
    useCinematicStore.getState().clear()
    close()
  }, [stage, close])

  useMenuKeys({ confirm: done, cancel: done }, stage === 'born')

  const line = useMemo(() => {
    if (stage === 'shaking') return '어라!?'
    const name = names?.[mon?.species ?? 0] ?? ''
    return `축하합니다! ${withSubject(name)} 태어났다!`
  }, [stage, names, mon])

  if (slot < 0) return null

  return (
    <MenuScreen title="알" foot={stage === 'born' ? 'Z 넘기기' : ''}>
      <div className={own.stage}>
        <div className={own.cinematicSpace} aria-hidden />
        <div className={own.line}>{line}</div>
      </div>
    </MenuScreen>
  )
}
