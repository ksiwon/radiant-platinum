// 배틀프런티어 시설 장면의 무대 (PARITY §9.3 · `scene/factoryScene`)
//
// 장면이 도는 동안 필드를 가리고 그 위에 대사창을 올린다. 빌리기 · 바꾸기 화면과 배틀은 그 위에 따로 뜬다
import { useEffect } from 'react'
import { markFrontierStage } from '../../app/sceneMark'
import { useFactoryStore } from '../../state/factoryStore'
import * as css from './frontierStage.css'

export function FrontierStage() {
  const on = useFactoryStore((s) => s.phase !== 'off')
  useEffect(() => {
    markFrontierStage(on)
    return () => { markFrontierStage(false) }
  }, [on])
  if (!on) return null
  return <div className={css.stage} aria-hidden />
}
