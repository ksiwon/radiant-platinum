// ④ 크기 쪽 (pokedex.md §4.2) — **잡은 종만** 열린다. 위가 「키 비교」(롬 43), 아래가 「몸무게 비교」(롬 44)다.
//
// 키: 풀밭 지평선 위에 포켓몬과 주인공을 나란히 세운다. 둘 다 **불투명한 한 색 실루엣**이다 (그림의 모양만 따고 색은 한 토큰 —
// 땅과 겹친 발도 다른 색으로 비치지 않는다). 크기 · 자리는 원작 표(`dexHeightWeight.json`)로 정한다 — 키 값으로 그냥 나누지
// 않는다 (`sizeMath`).
//
// ⚠️ **이름 + 키(몸무게) 글자는 각 실루엣의 가로 가운데 아래, 풀밭 띠 위에 서고 실루엣과 겹치지 않는다** (사용자 지적 ④).
// 가로 가운데는 그림 칸이 아니라 **알파가 있는 칸의 가운데**다(`alphaBox`) — 칸 가운데로 잡으면 치우친 모양이 어긋난다.
// 세로는 땅선 아래로 발이 가장 깊이 내려가는 양(실측 3 DS = 6px)보다 더 내려서 둔다.
//
// 몸무게: 시소 하나. 왼쪽 주인공, 오른쪽 포켓몬이고 무거운 쪽이 내려간다. 기울기는 원작 판정표(`Unk_ov21_021E9DB0`)다.
import { useEffect, useMemo, useState } from 'react'
import { useAssetImage } from '../../../data/providers/useAssetUrl'
import { POKEDEX_TEXT } from '../../../data/uiText'
import * as own from '../pokedexScreen.css'
import { DEX_LINE } from './dexText'
import type { DexData } from './dexData'
import {
  BAND, BOX, K, STAGE_W, TAG_GAP, TRAINER_WEIGHT, alphaBox, comparisonFor, foldTagX, heightLayout, seesawDegrees, silhouetteCenterX,
  type ContentBox, type Gender, type Placed,
} from './sizeMath'

/** 그림 한 장의 알파 둘레. 못 재면 null (이름표는 그림 칸 가운데에 선다) */
function useContentBox(url: string | null): ContentBox | null {
  const [state, setState] = useState<{ url: string, box: ContentBox | null } | null>(null)
  useEffect(() => {
    if (url === null) return
    let alive = true
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const g = canvas.getContext('2d', { willReadFrequently: true })
        if (!g) return
        g.drawImage(img, 0, 0)
        const px = g.getImageData(0, 0, canvas.width, canvas.height).data
        if (alive) setState({ url, box: alphaBox(px, canvas.width, canvas.height) })
      } catch { /* 이름표는 칸 가운데에 선다 */ }
    }
    img.src = url
    return () => { alive = false }
  }, [url])
  return state !== null && state.url === url ? state.box : null
}

function Silhouette({ art, at, size }: { art: string | null, at: Placed, size?: number }) {
  if (art === null) return null
  const s = size ?? at.size
  return (
    <span
      className={own.silhouette}
      aria-hidden
      style={{ '--art': `url(${art})`, left: at.left, top: at.top, width: s, height: s } as React.CSSProperties}
    />
  )
}

function Tag({ x, top, name, value }: { x: number, top: number, name: string, value: string }) {
  // 이름표가 무대 밖으로 안 나가게 가운데를 접는다 (폭의 절반)
  const cx = foldTagX(x, own.TAG_W)
  return (
    <div className={own.tag} style={{ left: cx, top }}>
      <span className={own.tagName}>{name}</span>
      <span className={own.tagValue}>{value}</span>
    </div>
  )
}

export function DexSize(
  { data, species, gender, trainerName }: {
    data: DexData
    species: number
    gender: Gender
    trainerName: string
  },
) {
  const monArt = useAssetImage(`data/pokemon/${String(species)}_front.png`)
  const trainerArt = useAssetImage(`data/trainers/${gender === 'male' ? '0' : '1'}.png`)
  const monBox = useContentBox(monArt)
  const trainerBox = useContentBox(trainerArt)
  const c = useMemo(() => comparisonFor(data.hw, species, gender), [data.hw, species, gender])
  if (c === null) return null

  const layout = heightLayout(c)
  const ui = data.ui
  const male = gender === 'male'
  const trainerHeight = ui[male ? DEX_LINE.lucasHeight : DEX_LINE.dawnHeight] ?? ''
  const trainerWeight = ui[male ? DEX_LINE.lucasWeight : DEX_LINE.dawnWeight] ?? ''
  const monName = data.names[species] ?? ''
  const tagTop = layout.ground + TAG_GAP

  // 몸무게 시소 — 같은 폭 안에서 가운데 축 하나
  const W = STAGE_W, L = 360, pivotX = W / 2, beamY = 76
  const deg = seesawDegrees(c.weight, TRAINER_WEIGHT[gender])
  const rad = (deg * Math.PI) / 180
  const dy = (L / 2) * Math.sin(rad), dx = (L / 2) * Math.cos(rad)
  const left = { x: pivotX - dx, y: beamY - dy }
  const right = { x: pivotX + dx, y: beamY + dy }
  // 시소 위의 실루엣은 원본의 0.6배(= 48px)다 — 크기를 견주는 것이 아니라 무게를 견주는 쪽이라 둘이 같다
  const seat = (p: { x: number, y: number }): Placed => {
    const size = 48
    return { left: p.x - size / 2, top: p.y - size - 4, size, scale: size / (BOX * K), cx: p.x, cy: p.y - size / 2 }
  }
  const trainerSeat = seat(left)
  const monSeat = seat(right)
  const weightTagTop = beamY + 26 + 12

  return (
    <>
      <div className={own.sizeHead}>{ui[DEX_LINE.heightCheck] ?? ''}</div>
      <div className={own.heightBox} style={{ width: STAGE_W, height: layout.ground + BAND }}>
        <div className={own.grass} style={{ height: BAND }} />
        <Silhouette art={monArt} at={layout.mon} />
        <Silhouette art={trainerArt} at={layout.trainer} />
        <Tag x={silhouetteCenterX(layout.mon, monBox)} top={tagTop} name={monName} value={(data.heights[species] ?? '').trim()} />
        <Tag x={silhouetteCenterX(layout.trainer, trainerBox)} top={tagTop} name={trainerName} value={trainerHeight} />
      </div>
      <div className={own.sizeHead} style={{ marginTop: 12 }}>{ui[DEX_LINE.weightCheck] ?? ''}</div>
      <div className={own.weightBox} style={{ width: W, maxWidth: '100%', height: 160 }}>
        <Silhouette art={trainerArt} at={trainerSeat} size={trainerSeat.size} />
        <Silhouette art={monArt} at={monSeat} size={monSeat.size} />
        <span className={own.pivot} style={{ left: pivotX - 14, top: beamY + 4 }} />
        <span
          className={own.beam}
          style={{ left: pivotX - L / 2, top: beamY - 4, width: L, transform: `rotate(${String(deg)}deg)` }}
          data-tilt={deg}
        />
        <Tag x={silhouetteCenterX(trainerSeat, trainerBox)} top={weightTagTop} name={trainerName} value={trainerWeight} />
        <Tag x={silhouetteCenterX(monSeat, monBox)} top={weightTagTop} name={monName} value={(data.weights[species] ?? '').trim()} />
      </div>
    </>
  )
}

/** 쪽이 열릴 수 있는가 — 표가 왔고 그 종 칸이 있다 */
export function sizeReady(data: DexData | null, species: number, gender: Gender): boolean {
  return data !== null && comparisonFor(data.hw, species, gender) !== null
}

/** 쓰는 롬 줄 (시험이 본다) */
export const SIZE_LINES = [POKEDEX_TEXT.height, POKEDEX_TEXT.weight] as const
