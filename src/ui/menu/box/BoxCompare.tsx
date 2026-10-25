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
import { useMenuUiText } from '../menuUiText'

/**
 * 비교 쪽 둘 (`enum CompareMode`의 능력치 · 기술).
 *
 * ⚠️ 원작의 가운데 쪽(콘테스트 능력치)은 **접었다** — 콘테스트는 범위 밖이라 멋짐 · 아름다움 다섯 값을 담는 계통이 없다
 */
export const COMPARE_PAGES = ['능력치', '기술'] as const

/** 능력 여섯의 키. 이름표는 `menuUiText`의 `compareStats`가 같은 차례로 준다 */
const STAT_ROWS: readonly (keyof ReturnType<typeof statsOf>)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

/**
 * ⚠️ **알은 능력치도 기술도 안 보인다.** 안에 든 종족이 새기 때문이다 — 원작도 알이면 성격 · 능력치 · 기술 줄을 안 찍는다
 * (`compareMon->isEgg == FALSE`일 때만 `ov19_021DEC04.c`가 그린다). 알 쪽은 「—」이고 막대가 없다
 */
const seen = (mon: PokemonInstance | null | undefined): mon is PokemonInstance => !!mon && !mon.isEgg

/** 막대 길이의 기준 — 두 마리의 여섯 값 가운데 가장 큰 것. 비슷한 값은 비슷한 길이가 된다 */
function statMax(
  mons: readonly (PokemonInstance | null)[], species: SpeciesTable | null,
): number {
  if (species === null) return 0
  let top = 0
  for (const mon of mons) {
    if (mon === null || mon.isEgg) continue
    const stats = statsOf(mon, species.of(mon))
    for (const key of STAT_ROWS) top = Math.max(top, stats[key])
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
  const ui = useMenuUiText()
  const [left, right] = mons
  if (!left && !right) return <div className={own.compareNote}>{ui.compareEmpty}</div>
  const top = statMax(mons, species)

  return (
    <div className={own.compare}>
      <div className={own.compareHead}>
        <Face mon={left ?? null} name={left ? nameOf(left) : ''} />
        <Face mon={right ?? null} name={right ? nameOf(right) : ''} />
      </div>
      <div className={own.compareTabs}>
        {ui.comparePages.map((label, i) => (
          <span key={label} className={i === page ? `${own.compareTab} ${own.compareTabOn}` : own.compareTab}>{label}</span>
        ))}
      </div>

      {page === 0 && species && left && right && (
        <div className={own.compareRows}>
          {STAT_ROWS.map((key, row) => {
            const label = ui.compareStats[row] ?? key
            const a = seen(left) ? statsOf(left, species.of(left))[key] : null
            const b = seen(right) ? statsOf(right, species.of(right))[key] : null
            // 이긴 쪽은 둘 다 보일 때만 가린다
            const aWin = a !== null && b !== null && a > b
            const bWin = a !== null && b !== null && b > a
            return (
              <div key={label} className={own.compareRow}>
                <span className={`${aWin ? own.compareWin : own.compareValue} ${own.compareValueLeft}`}>{a ?? '—'}</span>
                <span className={own.compareTrack}>
                  {a !== null && (
                    <span
                      className={aWin ? `${own.compareBarLeft} ${own.compareBarWin}` : own.compareBarLeft}
                      style={{ width: `${String(compareBar(a, top) * 100)}%` }}
                    />
                  )}
                </span>
                <span className={own.compareLabel}>{label}</span>
                <span className={own.compareTrack}>
                  {b !== null && (
                    <span
                      className={bWin ? `${own.compareBarRight} ${own.compareBarWin}` : own.compareBarRight}
                      style={{ width: `${String(compareBar(b, top) * 100)}%` }}
                    />
                  )}
                </span>
                <span className={bWin ? own.compareWin : own.compareValue}>{b ?? '—'}</span>
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
                {seen(left) && left.moves[i] ? moveNames[left.moves[i].move] ?? '' : '—'}
              </span>
              <span className={own.compareLabel}>{i + 1}</span>
              <span className={own.compareMoveText}>
                {seen(right) && right.moves[i] ? moveNames[right.moves[i].move] ?? '' : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {(!left || !right) && <div className={own.compareNote}>{ui.compareOneMore}</div>}
    </div>
  )
}
