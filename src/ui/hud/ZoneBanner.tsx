// 지역 진입 배너 — 경계를 넘었다는 것을 눈으로 확인시킨다.
//
// 맵 헤더의 label로 찾은 실제 지역명이 뜬다("떡잎마을", "201번도로"). 마을에서
// 도로로 걸어 나가는 것은 워프가 아니라 같은 행렬 안의 좌표 연속이라, 이 배너가
// 뜨는 것 자체가 "걸어서 이어진 신오"가 동작한다는 증거다.
import { useEffect, useState } from 'react'
import { useSessionStore } from '../../state/sessionStore'
import * as css from './zoneBanner.css'

export function ZoneBanner() {
  const zoneName = useSessionStore((s) => s.zoneName)
  // key를 바꿔 애니메이션을 다시 태운다. 같은 존으로 되돌아와도 배너가 뜬다
  const [shown, setShown] = useState<{ name: string; key: number } | null>(null)

  useEffect(() => {
    if (!zoneName) return
    setShown((prev) => ({ name: zoneName, key: (prev?.key ?? 0) + 1 }))
    const id = setTimeout(() => setShown(null), 2600)
    return () => clearTimeout(id)
  }, [zoneName])

  if (!shown) return null
  return <div key={shown.key} className={css.banner}>{shown.name}</div>
}
