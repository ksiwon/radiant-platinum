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
import { loadPokeIcons, loadSpeciesNames } from '../../data/gameData'
import type { PokeIcons } from '../../data/schema'
import { hatch } from '../../engine/pokemon/breeding'
import { mapById } from '../../engine/map/world'
import { useSessionStore } from '../../state/sessionStore'
import { useHatchStore } from '../../state/hatchStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import { pokeIcon } from './pokeIcon'
import { withSubject } from '../korean'
import { useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as own from './evolutionScreen.css'

/** 알이 흔들리는 시간(ms). 원작도 짧게 흔들고 곧바로 깬다 */
const SHAKE_MS = 1400

type Stage = 'shaking' | 'born'

export function HatchScreen() {
  const locale = useGameLocale()
  const [names, setNames] = useState<string[] | null>(null)
  const [icons, setIcons] = useState<PokeIcons | undefined>(undefined)
  const [stage, setStage] = useState<Stage>('shaking')
  const slot = useHatchStore((s) => s.slot)
  const close = useHatchStore((s) => s.close)
  const party = useSaveStore((s) => s.party)
  const mon = slot >= 0 ? party[slot] : undefined

  useEffect(() => {
    let alive = true
    loadSpeciesNames(locale)
      .then((got) => { if (alive) setNames(got) })
      .catch(() => { /* 이름 없이도 장면은 돈다 */ })
    loadPokeIcons()
      .then((got) => { if (alive) setIcons(got) })
      .catch(() => { /* 아이콘 없이도 돈다 */ })
    return () => { alive = false }
  }, [locale])

  /** 알을 실제로 깬다. 여기서만 세이브가 바뀐다 */
  const born = useCallback((): void => {
    const store = useSaveStore.getState()
    const at = store.party[slot]
    if (!at || !at.isEgg) { setStage('born'); return }
    const next = [...store.party]
    // 만난 자리는 **깬 자리**다. 맵 번호가 아니라 지역명 번호를 넘긴다
    next[slot] = hatch(at, mapById(useSessionStore.getState().mapId)?.label ?? 0)
    useSaveStore.setState({ party: next })
    store.markSeen(at.species)
    store.markCaught(at.species)
    setStage('born')
  }, [slot])

  useEffect(() => {
    if (slot < 0 || stage !== 'shaking') return
    const timer = setTimeout(born, SHAKE_MS)
    return () => { clearTimeout(timer) }
  }, [slot, stage, born])

  // 자리가 바뀌면 처음부터
  useEffect(() => { if (slot >= 0) setStage('shaking') }, [slot])

  const done = useCallback((): void => {
    if (stage !== 'born') return
    close()
  }, [stage, close])

  useMenuKeys({ confirm: done, cancel: done }, stage === 'born')

  // ⚠️ **알은 배틀 그림이 없다.** `pl_pokegra`는 494종(0~493)뿐이고 알은
  // `pl_otherpoke` 쪽이라 아직 안 뽑는다(§3.4 폼 그림과 같은 자리). 그동안은
  // **원작 아이콘**(`pl_poke_icon`의 494번)을 키워서 쓴다 — 지어낸 그림이 아니다
  const shown = stage === 'shaking' ? EGG_SPECIES : mon?.species ?? EGG_SPECIES
  const art = useAssetImage(
    stage === 'shaking' ? null : `data/pokemon/${String(shown)}_front.png`,
  )

  const line = useMemo(() => {
    if (stage === 'shaking') return '어라!?'
    const name = names?.[mon?.species ?? 0] ?? ''
    return `축하합니다! ${withSubject(name)} 태어났다!`
  }, [stage, names, mon])

  if (slot < 0) return null

  return (
    <MenuScreen title="알" foot={stage === 'born' ? 'Z 넘기기' : ''}>
      <div className={own.stage}>
        <div className={stage === 'shaking' ? own.artPulse : own.art}>
          {stage === 'shaking'
            ? <div style={pokeIcon(icons, EGG_SPECIES, ICON_PX)} aria-hidden />
            : art !== null && <img src={art} alt="" className={own.image} />}
        </div>
        <div className={own.line}>{line}</div>
      </div>
    </MenuScreen>
  )
}

/** `SPECIES_EGG`. 아이콘 표(496칸)의 494번이 알이다 */
const EGG_SPECIES = 494
/** 아이콘을 키우는 크기. 32픽셀짜리라 도트가 살아 보이는 선까지만 */
const ICON_PX = 160
