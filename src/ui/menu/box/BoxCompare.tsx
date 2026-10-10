// 비교하기 (`PC_MODE_COMPARE`) — 두 마리를 나란히 놓는다. 기둥의 상세 자리가 이 패널로 바뀐다.
//
// 위에 두 마리의 정면 그림과 이름 · Lv, 쪽 이름 둘(능력치 · 기술), 능력치 쪽은 **가운데 이름 + 양옆으로 퍼지는 막대 + 숫자**다.
// 이긴 쪽은 막대가 `ink.strong`이고 숫자가 굵다(색맹에도 읽힌다).
import { useAssetImage } from '../../../data/providers/useAssetUrl'
import type { SpeciesTable } from '../../../data/gameData'
import { SPECIES_EGG, spriteKey } from '../../../engine/pokemon/form'
import { statsOf } from '../../../engine/pokemon/instance'
import type { PokemonInstance } from '../../../engine/pokemon/instance'
import * as own from '../boxScreen.css'
import { compareBar } from './boxMenus'

/**
 * 비교 쪽 둘 (`enum CompareMode`의 능력치 · 기술).
 *
 * ⚠️ 원작의 가운데 쪽(콘테스트 능력치)은 **접었다** — 콘테스트는 범위 밖이라 멋짐 · 아름다움 다섯 값을 담는 계통이 없다
 */
export const COMPARE_PAGES = ['능력치', '기술'] as const

const STAT_ROWS: readonly (readonly [string, keyof ReturnType<typeof statsOf>])[] = [
  ['HP', 'hp'], ['공격', 'atk'], ['방어', 'def'],
  ['특공', 'spa'], ['특방', 'spd'], ['스피드', 'spe'],
]

/** 막대 길이의 기준 — 두 마리의 여섯 값 가운데 가장 큰 것. 비슷한 값은 비슷한 길이가 된다 */
function statMax(
  mons: readonly (PokemonInstance | null)[], species: SpeciesTable | null,
): number {
  if (species === null) return 0
  let top = 0
  for (const mon of mons) {
    if (mon === null) continue
    const stats = statsOf(mon, species.of(mon))
    for (const [, key] of STAT_ROWS) top = Math.max(top, stats[key])
  }
  return top
}

function Face({ mon, name }: { mon: PokemonInstance | null, name: string }) {
  const art = useAssetImage(mon === null ? null : `data/pokemon/${spriteKey(mon.species, mon.form, mon.isEgg)}_front.png`)
  return (
    <div className={own.compareMon}>
      {art === null ? <span className={own.compareArtBlank} /> : <img className={own.compareArt} src={art} alt="" />}
      <span className={own.compareLine}>
        <span className={own.compareName}>{mon === null ? '—' : name}</span>
        {mon !== null && !mon.isEgg && <span className={own.compareLevel}>Lv{mon.level}</span>}
      </span>
    </div>
  )
}

/** 두 마리를 나란히 놓고 본다. 쪽은 `COMPARE_PAGES`의 둘이다 */
export function BoxCompare(
  { page, mons, names, species, moveNames }: {
    page: number
    mons: readonly (PokemonInstance | null)[]
    names: readonly string[]
    species: SpeciesTable | null
    moveNames: readonly string[]
  },
) {
  // 알은 「알」이다 (`BoxApp_LoadBoxMonIntoComparison`이 알이면 종족 이름 칸을 쓴다)
  const nameOf = (mon: PokemonInstance): string =>
    (mon.isEgg ? names[SPECIES_EGG] : mon.nickname ?? names[mon.species]) ?? `#${String(mon.species)}`
  const [left, right] = mons
  if (!left && !right) return <div className={own.compareNote}>Z로 두 마리를 올린다 · Tab으로 쪽을 넘긴다</div>
  const top = statMax(mons, species)

  return (
    <div className={own.compare}>
      <div className={own.compareHead}>
        <Face mon={left ?? null} name={left ? nameOf(left) : ''} />
        <Face mon={right ?? null} name={right ? nameOf(right) : ''} />
      </div>
      <div className={own.compareTabs}>
        {COMPARE_PAGES.map((label, i) => (
          <span key={label} className={i === page ? `${own.compareTab} ${own.compareTabOn}` : own.compareTab}>{label}</span>
        ))}
      </div>

      {page === 0 && species && left && right && (
        <div className={own.compareRows}>
          {STAT_ROWS.map(([label, key]) => {
            const a = statsOf(left, species.of(left))[key]
            const b = statsOf(right, species.of(right))[key]
            return (
              <div key={label} className={own.compareRow}>
                <span className={`${a > b ? own.compareWin : own.compareValue} ${own.compareValueLeft}`}>{a}</span>
                <span className={own.compareTrack}>
                  <span
                    className={a > b ? `${own.compareBarLeft} ${own.compareBarWin}` : own.compareBarLeft}
                    style={{ width: `${String(compareBar(a, top) * 100)}%` }}
                  />
                </span>
                <span className={own.compareLabel}>{label}</span>
                <span className={own.compareTrack}>
                  <span
                    className={b > a ? `${own.compareBarRight} ${own.compareBarWin}` : own.compareBarRight}
                    style={{ width: `${String(compareBar(b, top) * 100)}%` }}
                  />
                </span>
                <span className={b > a ? own.compareWin : own.compareValue}>{b}</span>
              </div>
            )
          })}
        </div>
      )}

      {page === 1 && (
        <div className={own.compareMoves}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={own.compareMoveRow}>
              <span className={`${own.compareMoveText} ${own.compareMoveLeft}`}>
                {left?.moves[i] ? moveNames[left.moves[i].move] ?? '' : '—'}
              </span>
              <span className={own.compareLabel}>{i + 1}</span>
              <span className={own.compareMoveText}>
                {right?.moves[i] ? moveNames[right.moves[i].move] ?? '' : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {(!left || !right) && <div className={own.compareNote}>한 마리를 더 올린다</div>}
    </div>
  )
}
