// 포켓몬 미리보기 창 (`ScrCmd_DrawPokemonPreview`)
//
// 전설과 마주치기 직전에 그 모습이 창 하나에 뜬다. 원작은 아래 화면의 창
// 하나라 우리는 대사창 **위쪽**에 세운다 — 아래는 글이 차지하고 있다.
//
// 수다 녹음에서는 배운 뒤 창의 페라페가 **움직인다** — 배틀 그림의 두 컷을 원작 박자로 번갈아
// 보인다 (`previewStore.PREVIEW_ANIM`). 둘째 컷은 페라페만 구워 둔다 (`pokegra.SECOND_CUT_SPECIES`).
//
// ⚠️ **성별로 그림이 갈리지 않는다.** 원작은 `DrawPokemonPreview`에 성별을
// 같이 넘기는데 우리 그림 자료에는 성별 차이가 없다(`pokegra`가 앞모습 하나다).
// 값은 받아 두기만 한다 — 크레세리아는 늘 암컷이라 눈에 보이는 차이가 없다
import { useEffect, useState } from 'react'
import { spriteKey } from '../../engine/pokemon/form'
import { previewCutAt, PREVIEW_ANIM_FRAMES, usePreviewStore } from '../../state/previewStore'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import * as css from './pokemonPreview.css'

export function PokemonPreview() {
  const species = usePreviewStore((s) => s.species)
  const form = usePreviewStore((s) => s.form)
  const since = usePreviewStore((s) => s.animSince)
  const key = species === null ? null : spriteKey(species, form, false)
  const first = useAssetImage(key === null ? null : `data/pokemon/${key}_front.png`)
  // 둘째 컷은 움직일 때만 찾는다 — 페라페 말고는 없는 그림이다
  const second = useAssetImage(key === null || since === null ? null : `data/pokemon/${key}_front2.png`)
  const [cut, setCut] = useState<0 | 1>(0)

  useEffect(() => {
    if (since === null) { setCut(0); return }
    let raf = 0
    const tick = () => {
      const frame = Math.floor((performance.now() - since) * 60 / 1000)
      setCut(previewCutAt(frame))
      if (frame < PREVIEW_ANIM_FRAMES) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(raf) }
  }, [since])

  if (species === null) return null
  const art = cut === 1 && second !== null ? second : first
  return (
    <div className={css.frame} aria-hidden data-preview={species} data-preview-cut={cut}>
      {art !== null && <img className={css.art} src={art} alt="" />}
    </div>
  )
}
