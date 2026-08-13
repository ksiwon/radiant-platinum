// 포켓몬 미리보기 창 (`ScrCmd_DrawPokemonPreview`)
//
// 전설과 마주치기 직전에 그 모습이 창 하나에 뜬다. 원작은 아래 화면의 창
// 하나라 우리는 대사창 **위쪽**에 세운다 — 아래는 글이 차지하고 있다.
//
// ⚠️ **성별로 그림이 갈리지 않는다.** 원작은 `DrawPokemonPreview`에 성별을
// 같이 넘기는데 우리 그림 자료에는 성별 차이가 없다(`pokegra`가 앞모습 하나다).
// 값은 받아 두기만 한다 — 크레세리아는 늘 암컷이라 눈에 보이는 차이가 없다
import { usePreviewStore } from '../../state/previewStore'
import * as css from './pokemonPreview.css'

export function PokemonPreview() {
  const species = usePreviewStore((s) => s.species)
  if (species === null) return null
  return (
    <div className={css.frame} aria-hidden />
  )
}
