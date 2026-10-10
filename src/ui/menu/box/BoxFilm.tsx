// 필름 띠 — 열여덟 벽지를 이름 대신 한 줄로 늘어놓고 칸마다 채움 막대를 단다. 점프이자 현황이다 (box.md §4.6).
//
// 썸네일은 벽지 그림을 줄여 쓴다. **줄이는 것이 허용되는 유일한 자리**라 부드럽게 줄인다(`wallThumb`, SYSTEM §0).
// 채움 수는 실제 칸을 센 값이다 (`filmCells` → `countInBox`).
import type { BoxWallpapers } from '../../../data/schema'
import { BOX_SIZE } from '../../../engine/pokemon/boxes'
import { wallThumb } from '../pokeIcon'
import * as own from '../boxScreen.css'
import type { FilmCell } from './boxMenus'

export function BoxFilm(
  { walls, wallpapers, cells, names, current, peek, here, onPick }: {
    walls: BoxWallpapers | undefined
    /** 박스마다 고른 벽지 번호 */
    wallpapers: readonly number[]
    cells: readonly FilmCell[]
    /** 박스 이름 — 썸네일의 `title` */
    names: readonly string[]
    current: number
    /** 점프 목록이 가리키는 박스. 없으면 null */
    peek: number | null
    /** 지금 박스의 채움 수 */
    here: number
    onPick: (box: number) => void
  },
) {
  return (
    <div className={own.film} data-box-film>
      <div className={own.filmStrip}>
        {cells.map((cell) => {
          const on = cell.index === current
          const lifted = !on && peek === cell.index
          return (
            <div
              key={cell.index}
              className={[own.thumb, on ? own.thumbOn : '', lifted ? own.thumbPeek : ''].filter(Boolean).join(' ')}
              style={wallThumb(walls, wallpapers[cell.index] ?? 0, own.THUMB.w)}
              title={names[cell.index]}
              data-box-thumb={cell.index}
              onClick={() => { onPick(cell.index) }}
            >
              <span
                className={cell.full ? `${own.thumbFill} ${own.thumbFull}` : own.thumbFill}
                style={{ width: `${String(Math.round(cell.fill * 100))}%` }}
              />
            </div>
          )
        })}
      </div>
      <span className={own.filmCount} data-box-count>{here} / {BOX_SIZE}</span>
    </div>
  )
}
