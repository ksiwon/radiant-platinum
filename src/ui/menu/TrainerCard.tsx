// 트레이너 카드 — 시작 메뉴에서 이름 자리를 고르면 뜬다.
//
// 배지·플레이 시간·소지금. 원작은 여기에 서명과 도장이 붙지만 그건 통신
// 기능이라 지금은 없다.
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { useMenuKeys } from './useMenuKeys'
import * as css from './menuChrome.css'
import * as own from './trainerCard.css'

const BADGES = 8

/** 시:분. 원작도 초는 안 보여 준다 */
function playtime(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  return `${String(Math.floor(minutes / 60))}:${String(minutes % 60).padStart(2, '0')}`
}

export function TrainerCard() {
  const back = useMenuStore((s) => s.back)
  const { trainer, money, badges, pokedex } = useSaveStore()
  useMenuKeys({ cancel: back, confirm: back })

  const caught = [...pokedex.caught].reduce((n, byte) => n + popcount(byte), 0)

  return (
    <div className={css.overlay}>
      <div className={css.header}><span>트레이너 카드</span></div>
      <div className={own.card}>
        <div className={own.name}>{trainer.name || '이름 없음'}</div>
        <dl className={own.rows}>
          <dt>ID</dt><dd>{String(trainer.id).padStart(5, '0')}</dd>
          <dt>소지금</dt><dd>{money.toLocaleString('ko-KR')}원</dd>
          <dt>도감</dt><dd>{caught}마리</dd>
          <dt>플레이 시간</dt><dd>{playtime(trainer.playtimeMs)}</dd>
        </dl>
        <div className={own.badges}>
          {Array.from({ length: BADGES }, (_, i) => (
            <span key={i} className={own.badge} data-on={(badges & (1 << i)) !== 0 ? 'yes' : 'no'} />
          ))}
        </div>
      </div>
      <div className={css.footer}>X 닫기</div>
    </div>
  )
}

function popcount(byte: number): number {
  let n = byte, count = 0
  while (n) { count += n & 1; n >>= 1 }
  return count
}
