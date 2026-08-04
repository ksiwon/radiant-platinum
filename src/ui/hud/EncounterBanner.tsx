// 야생 조우 알림.
//
// 전투 화면은 아직 없다. 지금 증명하려는 것은 "풀숲을 밟으면 그 존의 인카운터
// 표에서 올바른 종이 올바른 레벨로 나온다"까지다 — 201번도로에서 찌르꼬 L2가
// 뜨면 타일 거동·헤더 표·인카운터 표 셋이 동시에 맞았다는 뜻이다.
import { useSessionStore } from '../../state/sessionStore'
import * as css from './encounterBanner.css'

export function EncounterBanner() {
  const encounter = useSessionStore((s) => s.encounter)
  const dismiss = useSessionStore((s) => s.setEncounter)
  if (!encounter) return null

  return (
    <div className={css.overlay} onClick={() => dismiss(null)}>
      <div className={css.card}>
        <div className={css.title}>앗! 야생 {encounter.name}이(가) 나타났다!</div>
        <div className={css.detail}>Lv.{encounter.level} · 도감번호 {encounter.species}</div>
        <div className={css.hint}>클릭해서 계속</div>
      </div>
    </div>
  )
}
