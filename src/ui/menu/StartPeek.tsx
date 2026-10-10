// 시작 메뉴 엿보기 — 고른 항목의 **실제 상태**를 한 덩어리 미리 보여 준다 (`start.md` §4.5).
//
// 뜨는 창이다. 실제 값만 쓴다 — 도감은 본 수 · 잡은 수, 포켓몬은 파티 아이콘과 작은 HP 막대, 공중날기는 날 포켓몬,
// 가방은 마지막 주머니가 열린 그림과 용돈, 카드는 배지와 플레이 시간, 리포트는 지명 · 배지 · 도감 · 시간.
// 설정 · 닫는다 · 포기한다는 보여 줄 것이 없다 — 엿보기를 **안 띄운다**(빈 판을 남기지 않는다).
//
// ⚠️ **`aria-hidden`이고 뿌리에 role이 없다.** 하네스가 문서의 첫 `[role="radiogroup"]`을 시작 메뉴로 읽고
// `[role="radiogroup"] [role="radio"]`를 메뉴 줄로 센다. 이 안에 `dl`도 두지 않는다(`run.mjs`가 마지막 `dl`을 읽는다).
import { useEffect, useState } from 'react'
import {
  loadPokeIcons, loadSpecies, loadSpeciesNames, loadBagSprite,
  type SpeciesTable,
} from '../../data/gameData'
import type { BagSprite, PokeIcons } from '../../data/schema'
import { fillMenuText, loadUiText, MONEY_WINDOW_TEXT, POKEDEX_TEXT, SAVE_INFO } from '../../data/uiText'
import { maxHp, type PokemonInstance } from '../../engine/pokemon/instance'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { BadgeRail } from '../common/BadgeRail'
import { HpBar } from '../common/HpBar'
import { bagMemory } from './BagScreen'
import { bagArtAt } from './bagArt'
import { monIconAt } from './pokeIcon'
import { clock, countBits, useDexTotals } from './SaveInfo'
import type { PeekKind } from './startMenuEntries'
import * as own from './startMenu.css'

/** 엿보기가 쓰는 자료. 하나씩 오고, 안 온 것은 그 줄만 빈다 */
interface PeekData {
  icons: PokeIcons | undefined
  species: SpeciesTable | undefined
  speciesNames: readonly string[]
  bag: BagSprite | undefined
  pockets: readonly string[]
  shop: readonly string[]
  dexText: readonly string[]
  info: readonly string[]
}

function usePeekData(): PeekData {
  const locale = useGameLocale()
  const [icons, setIcons] = useState<PokeIcons | undefined>(undefined)
  const [species, setSpecies] = useState<SpeciesTable | undefined>(undefined)
  const [speciesNames, setSpeciesNames] = useState<readonly string[]>([])
  const [bag, setBag] = useState<BagSprite | undefined>(undefined)
  const [pockets, setPockets] = useState<readonly string[]>([])
  const [shop, setShop] = useState<readonly string[]>([])
  const [dexText, setDexText] = useState<readonly string[]>([])
  const [info, setInfo] = useState<readonly string[]>([])

  useEffect(() => {
    let alive = true
    // 하나가 안 와도 나머지는 그린다 — 각자 따로 받는다. 못 받은 것은 그 줄이 빈 채로 남는다
    const take = <T,>(job: Promise<T>, put: (v: T) => void): void => {
      job.then((v) => { if (alive) put(v) }, () => { /* 엿보기는 덤이다 */ })
    }
    take(loadPokeIcons(), setIcons)
    take(loadSpecies(), setSpecies)
    take(loadBagSprite(), setBag)
    take(loadSpeciesNames(locale), setSpeciesNames)
    take(loadUiText('bagPockets', locale), setPockets)
    take(loadUiText('shop', locale), setShop)
    take(loadUiText('pokedex', locale), setDexText)
    take(loadUiText('saveInfo', locale), setInfo)
    return () => { alive = false }
  }, [locale])

  return { icons, species, speciesNames, bag, pockets, shop, dexText, info }
}

/** 도감: 「발견한 수 N」 「잡은 수 M」 (롬 뱅크 697 0 · 1) */
function DexPeek({ data }: { data: PeekData }) {
  const counts = useDexTotals()
  return (
    <div className={own.peekPairs}>
      <span className={own.peekPair}>
        {data.dexText[POKEDEX_TEXT.seen] ?? ''}
        <span className={own.peekValue}>{counts.seen}</span>
      </span>
      <span className={own.peekPair}>
        {data.dexText[POKEDEX_TEXT.caught] ?? ''}
        <span className={own.peekValue}>{counts.caught}</span>
      </span>
    </div>
  )
}

/** 포켓몬: 파티 아이콘 최대 여섯과 각자의 작은 HP 막대 */
function PartyPeek({ data }: { data: PeekData }) {
  const party = useSaveStore((s) => s.party)
  return (
    <div className={own.peekParty}>
      {party.slice(0, 6).map((mon, i) => (
        <span key={i} className={own.peekMon}>
          <span style={monIconAt(data.icons, mon, 1)} />
          {!mon.isEgg && data.species && (
            <span className={own.peekMonBar}>
              <HpBar hp={mon.hp} max={maxHp(mon, data.species.of(mon))} height={5} />
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

/** 공중날기: 날 포켓몬의 아이콘과 이름 */
function FlyPeek({ data, flyer }: { data: PeekData; flyer: PokemonInstance | null }) {
  if (flyer === null) return null
  const name = flyer.nickname ?? data.speciesNames[flyer.species] ?? ''
  return (
    <>
      <span style={monIconAt(data.icons, flyer, 2)} />
      <span className={own.peekText}><span className={own.peekTitle}>{name}</span></span>
    </>
  )
}

/** 가방: 마지막 주머니가 열린 가방 그림 64와 주머니 이름, 용돈 */
function BagPeek({ data }: { data: PeekData }) {
  const money = useSaveStore((s) => s.money)
  const gender = useSaveStore((s) => s.trainer.gender)
  const label = data.shop[MONEY_WINDOW_TEXT.label] ?? ''
  const amount = fillMenuText(data.shop[MONEY_WINDOW_TEXT.amount] ?? '', [money.toLocaleString('ko-KR')])
  return (
    <>
      <span style={{ ...bagArtAt(data.bag, bagMemory.pocket, gender, 1), flex: '0 0 auto' }} />
      <span className={own.peekText}>
        <span className={own.peekTitle}>{data.pockets[bagMemory.pocket] ?? ''}</span>
        <span className={own.peekSub}>
          {label} <span className={own.peekStrong}>{amount}</span>
        </span>
      </span>
    </>
  )
}

/** 트레이너 카드: 배지 여덟 칸과 플레이 시간 */
function CardPeek({ data }: { data: PeekData }) {
  const badges = useSaveStore((s) => s.badges)
  const playtime = clock(useSaveStore((s) => s.trainer.playtimeMs))
  return (
    <div className={own.peekCol}>
      <BadgeRail badges={badges} size={22} />
      <span className={own.peekSub}>
        {data.info[SAVE_INFO.playtime] ?? ''} <span className={own.peekStrong}>{playtime}</span>
      </span>
    </div>
  )
}

/** 리포트: 지명 · 배지 · 도감 · 시간 넉 줄을 작게 (`SaveInfo`와 같은 값) */
function ReportPeek({ data }: { data: PeekData }) {
  const badges = countBits(useSaveStore((s) => s.badges), 8)
  const playtime = clock(useSaveStore((s) => s.trainer.playtimeMs))
  const counts = useDexTotals()
  return (
    <div className={own.peekPairs}>
      <span className={own.peekPair}>{data.info[SAVE_INFO.badges] ?? ''}<span className={own.peekValue}>{badges}</span></span>
      {counts.seen > 0 && (
        <span className={own.peekPair}>{data.info[SAVE_INFO.pokedex] ?? ''}<span className={own.peekValue}>{counts.seen}</span></span>
      )}
      <span className={own.peekPair}>{data.info[SAVE_INFO.playtime] ?? ''}<span className={own.peekValue}>{playtime}</span></span>
    </div>
  )
}

/**
 * 엿보기 한 장. `top`은 화면 위에서의 창 위끝(px)이고 `nibAt`은 그 안에서 꼭지가 서는 높이다 — 둘 다
 * `StartMenu`가 고른 줄의 가운데에 맞춰 준다. 내용은 `key`로 갈아 끼워 0.10s 크로스페이드한다
 */
export function StartPeek(
  { kind, flyer, top, nibAt }: { kind: PeekKind; flyer: PokemonInstance | null; top: number; nibAt: number },
) {
  const data = usePeekData()
  return (
    <div
      className={own.peek}
      aria-hidden
      data-start-peek={kind}
      style={{ top, ['--nib-at' as string]: `${String(nibAt)}px` }}
    >
      <div key={kind} className={own.peekBody}>
        {kind === 'dex' && <DexPeek data={data} />}
        {kind === 'party' && <PartyPeek data={data} />}
        {kind === 'fly' && <FlyPeek data={data} flyer={flyer} />}
        {kind === 'bag' && <BagPeek data={data} />}
        {kind === 'card' && <CardPeek data={data} />}
        {kind === 'report' && <ReportPeek data={data} />}
      </div>
    </div>
  )
}
