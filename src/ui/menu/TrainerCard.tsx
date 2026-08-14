// 트레이너 카드 — 시작 메뉴에서 이름 자리를 고르면 뜬다.
//
// 배지·플레이 시간·소지금. 원작은 여기에 서명과 도장이 붙지만 그건 통신
// 기능이라 지금은 없다.
import { useMenuStore } from '../../state/menuStore'
import { useSaveStore } from '../../state/saveStore'
import { RECORD_TRAINER_SCORE, recordValue } from '../../engine/world/gameRecords'
import { useMenuKeys } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './trainerCard.css'

const BADGES = 8

/** 시:분. 원작도 초는 안 보여 준다 */
function playtime(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  return `${String(Math.floor(minutes / 60))}:${String(minutes % 60).padStart(2, '0')}`
}

/** 처음 전당에 든 때. 원작도 날짜와 시:분까지 찍는다 (`TrainerCase_SetDates`) */
function debut(at: number): string {
  const d = new Date(at)
  return `${String(d.getFullYear())}. ${String(d.getMonth() + 1)}. ${String(d.getDate())}`
    + ` ${String(d.getHours())}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function TrainerCard() {
  const back = useMenuStore((s) => s.back)
  const { trainer, money, badges, pokedex, records } = useSaveStore()
  useMenuKeys({ cancel: back, confirm: back })

  const caught = [...pokedex.caught].reduce((n, byte) => n + popcount(byte), 0)

  return (
    <MenuScreen title="트레이너 카드" foot="X 닫기">
      <div className={css.stageWide}>
        <div className={own.card}>
          <div className={own.top}>
            <div>
              <div className={own.title}>트레이너</div>
              <div className={own.name}>{trainer.name || '이름 없음'}</div>
            </div>
            <div className={own.idNo}>
              <span className={own.idLabel}>ID No.</span>
              {String(trainer.id).padStart(5, '0')}
            </div>
          </div>

          <dl className={own.rows}>
            <dt>소지금</dt><dd>{money.toLocaleString('ko-KR')}원</dd>
            <dt>도감</dt><dd>{caught}마리</dd>
            <dt>플레이 시간</dt><dd>{playtime(trainer.playtimeMs)}</dd>
            {/* 트레이너 스코어 (PARITY §7.5). 기록 1번 칸이 곧 이 값이다 —
                뱃지 하나가 30, 명예의 전당이 35, 전국도감 상장이 10,000이다 */}
            <dt>스코어</dt>
            <dd>{recordValue(records, RECORD_TRAINER_SCORE).toLocaleString('ko-KR')}</dd>
            {/* 원작 카드도 **이긴 뒤에만** 이 줄을 그린다 (`TrainerCase_SetDates`가
                `gameCompleted`를 같이 받는다) */}
            {trainer.firstClearedAt !== null && (
              <>
                <dt>명예의 전당</dt>
                <dd>{debut(trainer.firstClearedAt)}</dd>
              </>
            )}
          </dl>

          <div className={own.badgeHead}>배지</div>
          <div className={own.badges}>
            {Array.from({ length: BADGES }, (_, i) => (
              <span key={i} className={own.badge} data-on={(badges & (1 << i)) !== 0 ? 'yes' : 'no'} />
            ))}
          </div>
        </div>
      </div>
    </MenuScreen>
  )
}

function popcount(byte: number): number {
  let n = byte, count = 0
  while (n) { count += n & 1; n >>= 1 }
  return count
}
