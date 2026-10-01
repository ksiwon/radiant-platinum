// 지역 진입 배너 — 경계를 넘었다는 것을 눈으로 확인시킨다.
//
// 맵 헤더의 label로 찾은 실제 지역명이 뜬다("떡잎마을", "201번도로"). 마을에서
// 도로로 걸어 나가는 것은 워프가 아니라 같은 행렬 안의 좌표 연속이라, 이 배너가
// 뜨는 것 자체가 "걸어서 이어진 신오"가 동작한다는 증거다.
import { useEffect, useState } from 'react'
import { useSessionStore } from '../../state/sessionStore'
import { useIntroStageStore } from '../../state/introStageStore'
import * as css from './zoneBanner.css'

export function ZoneBanner() {
  const zoneName = useSessionStore((s) => s.zoneName)
  /**
   * ⚠️ **오프닝 동안은 안 띄운다.** 마박사가 말하는 동안 뒤에서 첫 맵을 미리
   * 실으며 지역이 정해지는데, 그때 이 판이 검은 무대 위에 「떡잎마을」을 띄웠다.
   * 원작은 오프닝에 지명판이 없고, 끝나고 서는 곳도 내 방이라 **건물에서는
   * 지명판을 안 띄운다** (`FieldSystem_RequestLocationName`의 `MapHeader_IsBuilding`)
   */
  const intro = useIntroStageStore((s) => s.scene) !== 'off'
  // key를 바꿔 애니메이션을 다시 태운다. 같은 존으로 되돌아와도 배너가 뜬다
  const [shown, setShown] = useState<{ name: string; key: number } | null>(null)

  useEffect(() => {
    if (!zoneName) return
    // ⚠️ **오프닝 동안 정해진 지역은 들어간 것이 아니다.** 여기서 시계를 안 걸고,
    // 판도 그때 안 띄운다 — 의존에 오프닝을 넣지 않으므로 오프닝이 끝나도 같은
    // 지역이면 이 효과가 다시 안 돈다. 끝난 직후에 안 들어간 지명이 뜨지 않는다
    if (useIntroStageStore.getState().scene !== 'off') return
    setShown((prev) => ({ name: zoneName, key: (prev?.key ?? 0) + 1 }))
    const id = setTimeout(() => setShown(null), 2600)
    return () => clearTimeout(id)
  }, [zoneName])

  if (intro || !shown) return null
  return <div key={shown.key} className={css.banner}>{shown.name}</div>
}
