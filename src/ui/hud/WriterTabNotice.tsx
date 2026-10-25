// 읽기 전용 탭 안내 — 다른 탭이 이미 저장소를 쥐고 있을 때 한 줄 (`state/writerLock`)
//
// ⚠️ **메뉴 · 대사 · 배틀 위에서도 안 숨긴다.** 저장 화면이 떠 있을 때 가장 필요한 말이다. 쥔 탭이 닫히면 이 탭이
// 이어받아 띠가 스스로 사라진다.
import { useSyncExternalStore } from 'react'
import { isReadOnlyTab, subscribeWriter } from '../../state/writerLock'
import * as css from './writerTabNotice.css'

export default function WriterTabNotice() {
  const readOnly = useSyncExternalStore(subscribeWriter, isReadOnlyTab)
  if (!readOnly) return null
  return (
    <div className={css.box} role="status" aria-label="다른 탭 안내">
      <span className={css.title}>다른 탭에서 이미 게임이 열려 있습니다.</span>
      <span>이 탭에서는 저장하지 않습니다. 그 탭을 닫으면 이 탭이 이어받습니다.</span>
    </div>
  )
}
