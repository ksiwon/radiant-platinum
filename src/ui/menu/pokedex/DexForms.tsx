// ⑤ 모습 쪽 (pokedex.md §4.2) — 무대에 그 모습, 표찰 자리에 모습 이름(롬 글), 그 아래에 **모습 아이콘 띠**.
// 고른 것만 금 고리다. 점 열넷 대신 실제 모습 아이콘이 줄 선다 (안농 28은 줄이 바뀐다).
//
// 모습 이름은 종마다 롬의 다른 줄이다 (`dexForms.formName`). 이름이 없는 종(캐스퐁 · 벚꼬리 · 아르세우스)은 원작도 빈 줄이라
// 종 이름만 둔다. ⚠️ 「본 모습만」은 세이브에 기록이 없어 못 건다 — 있는 모습을 다 보인다 (PARITY).
import { iconSlot } from '../../../engine/pokemon/form'
import { MonViewport } from '../../common/MonViewport'
import { PIXEL } from '../../theme/scale'
import { pokeIconAt } from '../pokeIcon'
import * as own from '../pokedexScreen.css'
import { formName } from './formNames'
import type { DexData } from './dexData'
import { INFO_SIZE } from './DexInfo'

export function DexForms(
  { data, species, form, forms, onPick }: {
    data: DexData
    species: number
    form: number
    forms: number
    onPick: (form: number) => void
  },
) {
  const label = formName(species, form, data.ui)
  return (
    <>
      <div className={own.formsTop}>
        <div className={own.stage} style={{ width: INFO_SIZE, height: INFO_SIZE }}>
          <MonViewport species={species} form={form} size={INFO_SIZE} />
        </div>
        <div className={own.card}>
          <div className={own.formName}>{label !== '' ? label : data.names[species] ?? ''}</div>
          {label !== '' && <div className={own.category}>{data.names[species] ?? ''}</div>}
        </div>
      </div>
      <div className={own.formStrip}>
        {Array.from({ length: forms }, (_, i) => (
          <span
            key={i}
            className={i === form ? own.formCellOn : own.formCell}
            data-form={i}
            onClick={() => { onPick(i) }}
          >
            <span aria-hidden style={pokeIconAt(data.icons ?? undefined, iconSlot(species, i, false), PIXEL.x1)} />
          </span>
        ))}
      </div>
    </>
  )
}
