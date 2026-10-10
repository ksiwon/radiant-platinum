// ② 분포 쪽 (pokedex.md §4.2) — **실제 타운맵 그림** 위에 그린다.
//
// 위 띠가 하늘(아침 · 낮 · 밤, 롬 36~38)이고 시간대마다 BDSP 하늘 두 색이 교차한다. 처음에는 지금 게임 시계의 시간대에
// 선다 — 원작도 `timeOfDay`를 넘겨받아 거기서 연다. 시간대는 Shift로 돈다(←→는 쪽 넘김이라 못 쓴다).
//
// 지도: 타운맵 256×192 그림의 칸이 있는 곳(224×168)을 정수 2배로 놓는다. 그 위에 이 종의 칸을 금색으로 칠하고 동굴은 고리로
// 찍는다 — 빨강은 안 쓴다 (`셈은 areaMath`). 자리가 없으면 지도 가운데에 「서식지 불명」(롬 35)을 띄운다. 분포는 **본 종에게
// 열린다** (`ov21_021E29DC.c`는 크기만 `CS_CAUGHT`를 묻는다).
//
// 숨은 섬 넷(만월섬 · 신월섬 · 해변길 · 봄의 길)은 원작이 깃발로 지도 조각을 덧그린다. 타운맵 그림에는 그 조각이 없다 (PARITY).
import { useMemo } from 'react'
import { useAssetImage } from '../../../data/providers/useAssetUrl'
import * as own from '../pokedexScreen.css'
import {
  CELL, MAP_CROP, MAP_SCALE, MAP_W, cellRect, dungeonCenter, spotsFor, type AreaTime,
} from './areaMath'
import { DEX_LINE } from './dexText'
import type { DexData } from './dexData'

const SKIES = ['Morning', 'Day', 'Night'] as const

/** 타운맵 그림 한 장의 높이 (256×192) */
const MAP_H = 192

export function DexArea(
  { data, species, time, national }: { data: DexData, species: number, time: AreaTime, national: boolean },
) {
  const art = useAssetImage('data/townMap.png')
  const spots = useMemo(
    () => spotsFor(data.habitat, species, time, national),
    [data.habitat, species, time, national],
  )
  const any = spots.cells.length > 0 || spots.dungeons.length > 0
  const w = MAP_CROP.w * MAP_SCALE, h = MAP_CROP.h * MAP_SCALE
  const night = time === 2
  return (
    <>
      <div className={own.skyBand} data-area-time={SKIES[time]}>
        {SKIES.map((sky) => (
          <span key={sky} className={`${own.skyFace} ${own.skyLayer[sky]}`} data-on={sky === SKIES[time] ? 'yes' : 'no'} aria-hidden />
        ))}
        {SKIES.map((sky, i) => (
          <span
            key={sky}
            className={night ? `${own.skyTime} ${own.skyTimeNight}` : own.skyTime}
            data-on={i === time ? 'yes' : 'no'}
          >
            {data.ui[DEX_LINE.timeFirst + i] ?? ''}
          </span>
        ))}
      </div>
      <div className={own.mapRow}>
        <div
          className={own.map}
          style={{
            width: w,
            height: h,
            ...(art !== null
              ? {
                backgroundImage: `url(${art})`,
                backgroundSize: `${String(MAP_W * MAP_SCALE)}px ${String(MAP_H * MAP_SCALE)}px`,
                backgroundPosition: `-${String(MAP_CROP.x * MAP_SCALE)}px -${String(MAP_CROP.y * MAP_SCALE)}px`,
              }
              : {}),
          }}
        >
          <span className={own.mapScrim} />
          {spots.cells.map((c) => {
            const r = cellRect(c)
            return (
              <span
                key={`${String(c.row)}/${String(c.col)}`}
                className={own.spot}
                style={{ left: r.left, top: r.top, width: r.size, height: r.size }}
              />
            )
          })}
          {spots.dungeons.map((d, i) => {
            const p = dungeonCenter(d)
            return <span key={`d${String(i)}`} className={own.cave} style={{ left: p.cx, top: p.cy }} />
          })}
          {!any && <span className={own.unknownArea}>{data.ui[DEX_LINE.areaUnknown] ?? ''}</span>}
        </div>
      </div>
    </>
  )
}

/** 칸 한 개의 화면 크기. 시험이 본다 */
export const AREA_CELL_PX = CELL * MAP_SCALE
