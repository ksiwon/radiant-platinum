// 볼 씰 그림 한 장 — 롬에서 구운 24×24 (`data/sealIcons.png`, `tools/extract/sealIcons.js`)
//
// 시트를 못 받았거나(없는 설치본) 번호가 밖이면 아무것도 안 그린다. 부르는 쪽이 글자 이름을 같이 두므로
// 그림이 없을 때만 글자로 떨어진다.
import type { SpriteSheet } from '../../data/spriteSheet'
import { pixelCell, pixelSprite } from './pixelSprite'
import type { PixelScale } from '../theme/scale'

export function SealIcon({ sheet, id, scale, className }: {
  sheet: SpriteSheet | null | undefined
  /** 씰 번호 (1부터) */
  id: number
  scale: PixelScale
  className?: string
}) {
  if (!sheet || pixelCell(sheet, id - 1, scale) === null) return null
  return <i className={className} style={{ display: 'inline-block', flex: '0 0 auto', ...pixelSprite(sheet, id - 1, scale) }} aria-hidden />
}
