// 무엇으로 그만둘지, 그리고 못 잰 것을 어떻게 적을지 — 진행 계수기와 분류
// (`docs/orders/DEPLOY_PHASE_ORDER_20260909.md` §1.1)
//
// ⚠️ **벽시계로 그만두면 같은 코드가 기계 부하로 판정이 뒤집힌다.** 하네스의
// 상한이 전부 시간이었다 — `goTo` 900초, `stepOn` 180초, `pushBattle` 45초.
// 실측(2026-09-09): 다른 프로세스와 CPU를 나눠 쓰기 시작하자 그 전까지 통과하던
// 축복시티 구간이 「시간이 다 됐다」로 떨어졌다. 게임은 한 줄도 안 바뀌었다.
// 반대편 실측도 있다 — 무쇠 체육관 배틀이 **542번 눌러서** 끝났는데, 45초
// 상한은 그것을 「얼었다」로 적었다. **시간은 결함을 못 가른다.**
//
// 그래서 그만두는 자를 **진행**으로 바꾼다. 진행이 있으면 얼마가 걸리든 기다리고,
// 진행이 없으면 얼마 안 걸렸어도 그만둔다. 관측 한 회는 기존 한 바퀴라 기계가
// 느리면 한 회가 저절로 길어진다 — 부하가 상한을 자동으로 늘린다.
//
// ⚠️ **여기 있는 것은 전부 순수 함수다.** 판정의 뜻을 정하는 자리라 페이지도
// 시계도 안 만진다 — `budget.test.mjs`가 그것을 그대로 시험한다

/**
 * 실패의 **모양**. 무엇이 실패했는가가 아니라 **무엇으로 실패를 알았는가**다.
 *
 * ⚠️ **이 갈래가 BLOCKED의 자격을 정한다.** 시간 모양만이 「기계가 붐벼서 못
 * 쟀다」가 될 수 있다. 내용 모양은 기계가 아무리 붐벼도 FAIL이다 — 대사가
 * 0/12쪽이거나 화면이 틀렸거나 콘솔에 오류가 있는 것은 느려서 생기지 않는다
 */
export const SHAPE = {
  /** 시간이 다 됐다·느리다. 붐빔이 실측되면 BLOCKED(경합)가 될 수 있다 */
  time: 'time',
  /** 서버가 안 떴다·연결이 안 됐다. 게임을 못 열었으니 잰 것이 없다 */
  infra: 'infra',
  /** 값이 틀렸다·화면이 틀렸다·오류가 났다. **절대 BLOCKED로 안 내려간다** */
  content: 'content',
}

/**
 * 못 잰 것의 머리말. **부르는 쪽이 글자로 가르므로 여기가 정본이다.**
 *
 * ⚠️ **「시간이 다 됐다」 하나로 적으면 둘이 섞인다.** 나아가는 중에 총예산이
 * 끝난 것과 멈춘 채로 견딤을 채운 것은 다른 일이다 — 앞은 **못 잰 것**이고
 * 뒤는 **막힌 것**이다. 앞을 실패로 적으면 붐비는 기계가 결함을 만들어 내고,
 * 뒤를 못 잰 것으로 적으면 진짜 결함이 숨는다
 */
export const SLOW = '느림 · 관측 불능'
/** 진행 없이 견딤을 채웠다. **이것은 실패다** */
export const STALLED = '멈췄다'
/**
 * 게임을 **아예 못 열었다** — 서버가 안 대답했다 (지시서 H3).
 *
 * ⚠️ **머리말로 가른다.** 던져진 오류 하나가 바깥 `catch`까지 가는 동안
 * 「무엇이 실패했는가」를 잃지 않아야 한다
 */
export const INFRA = '[인프라]'

/** 붐빔의 문턱 (지시서 §1.1 「분류 규칙」). 판정이 아니라 **분류**에만 쓴다 */
export const BUSY = { fps: 15, cpu: 85 }

/**
 * 진행 계수기.
 *
 * 지문이 바뀌면 진행이고, 안 바뀐 채로 `patience`번을 채우면 멈춘 것이다.
 * **시각을 안 본다** — 부르는 쪽이 한 바퀴를 얼마나 오래 도는지는 상관없다.
 *
 * ⚠️ **첫 관측은 진행이 아니다.** 비교할 앞이 없으므로 `moves`에 안 센다.
 * 그것을 세면 아무것도 안 한 부름이 「한 번 나아갔다」로 적힌다
 *
 * @param patience 진행 없이 몇 회를 견디나. 회당 한 바퀴다
 */
export function makeStall(patience) {
  if (!Number.isInteger(patience) || patience < 1) {
    throw new Error(`견딜 횟수가 1 이상 정수가 아니다: ${String(patience)}`)
  }
  let last = null
  let idle = 0
  let moves = 0
  let seen = 0
  return {
    patience,
    /**
     * 지문 하나를 적는다.
     *
     * @returns 멈췄는가 — 진행 없이 `patience`번을 채웠는가
     */
    note(fp) {
      seen++
      if (last === null || fp !== last) {
        if (last !== null) moves++
        last = fp
        idle = 0
        return false
      }
      idle++
      return idle >= patience
    },
    /** 지금까지 진행 없이 몇 회를 왔나 */
    get idle() { return idle },
    /** 지문이 바뀐 횟수. 「아무것도 안 하고 끝났다」와 「가다 말았다」를 가른다 */
    get moves() { return moves },
    /** 적은 지문 수 */
    get seen() { return seen },
    /** 마지막 지문. 어디서 멈췄는지를 그대로 보고한다 */
    get last() { return last },
    /**
     * **나아가는 중이었나.** 총예산 상한에 걸렸을 때 이것을 본다 — 참이면
     * 그 부름은 실패가 아니라 **느림(관측 불능)**이다 (지시서 H1)
     */
    get moving() { return moves > 0 && idle < patience },
  }
}

/** `n`번째 백분위. 표본이 비었으면 `null`이다 — **0으로 안 접는다** */
export function pct(values, p) {
  const all = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (all.length === 0) return null
  const at = Math.min(all.length - 1, Math.max(0, Math.round((all.length - 1) * p)))
  return all[at]
}

/**
 * 판 전체의 부하 표본을 요약한다 (지시서 H4).
 *
 * ⚠️ **평균을 안 쓴다.** 프레임은 한쪽으로 길게 늘어진 분포라 평균이 봉우리를
 * 가린다 — 중앙값과 아래 꼬리(p10)를 따로 적어야 「대체로 잘 도는데 가끔
 * 멎는다」와 「내내 느리다」가 갈린다.
 *
 * @param samples `{ fps, cpu }` 목록. 못 잰 값은 넣지 않는다 (`null` 금지)
 */
export function summarizeLoad(samples) {
  const fps = samples.map((s) => s?.fps).filter((v) => Number.isFinite(v))
  const cpu = samples.map((s) => s?.cpu).filter((v) => Number.isFinite(v))
  return {
    n: samples.length,
    fps: fps.length === 0 ? null
      : { n: fps.length, p50: round1(pct(fps, 0.5)), p10: round1(pct(fps, 0.1)), min: round1(pct(fps, 0)) },
    cpu: cpu.length === 0 ? null
      : { n: cpu.length, p50: round1(pct(cpu, 0.5)), p90: round1(pct(cpu, 0.9)), max: round1(pct(cpu, 1)) },
  }
}

const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10)

/**
 * 그 판이 **붐볐는가**.
 *
 * ⚠️ **못 쟀으면 못 쟀다고 한다.** 표본이 없는 것을 「안 붐볐다」로도
 * 「붐볐다」로도 안 접는다 — 앞으로 접으면 진짜 경합이 FAIL로 굳고, 뒤로
 * 접으면 진짜 결함이 BLOCKED로 숨는다
 */
export function isBusy(load) {
  if (load === null || load === undefined) return { known: false, why: '부하 표본이 없다' }
  const fpsSlow = load.fps !== null && load.fps !== undefined
    && Number.isFinite(load.fps.p50) && load.fps.p50 < BUSY.fps
  const cpuHot = load.cpu !== null && load.cpu !== undefined
    && Number.isFinite(load.cpu.p50) && load.cpu.p50 > BUSY.cpu
  if (!fpsSlow && !cpuHot
    && (load.fps === null || load.fps === undefined)
    && (load.cpu === null || load.cpu === undefined)) {
    return { known: false, why: '부하 표본이 비었다' }
  }
  const why = [
    fpsSlow ? `fps 중앙값 ${String(load.fps.p50)} < ${String(BUSY.fps)}` : null,
    cpuHot ? `CPU 중앙값 ${String(load.cpu.p50)}% > ${String(BUSY.cpu)}%` : null,
  ].filter((x) => x !== null)
  return { known: true, value: why.length > 0, why: why.join(' · ') || '붐비지 않았다' }
}

/**
 * 실패 하나를 FAIL과 BLOCKED로 가른다 (지시서 §1.1 「분류 규칙」).
 *
 * ⚠️ **BLOCKED는 통과가 아니다.** 그 묶음은 다시 돌아야 하고, 다시 돌아서
 * PASS가 되기 전에는 완료 조건이 안 선다. 여기서 하는 일은 「이 실패로 제품을
 * 의심할 것인가」를 가르는 것뿐이다
 *
 * @param shape `SHAPE`의 하나
 * @param load `summarizeLoad`의 결과 (없으면 `null`)
 */
export function classify(shape, load) {
  // ⚠️ **내용은 기계 탓으로 못 내린다.** 이 한 줄이 이 파일의 전부다
  if (shape === SHAPE.content) {
    return { verdict: 'FAIL', why: '내용 실패는 기계가 붐벼도 실패다' }
  }
  if (shape === SHAPE.infra) {
    return { verdict: 'BLOCKED', kind: '인프라', why: '게임을 못 열었다 — 잰 것이 없다' }
  }
  if (shape !== SHAPE.time) {
    return { verdict: 'FAIL', why: `모르는 실패 모양이다 (${String(shape)})` }
  }
  const busy = isBusy(load)
  // ⚠️ **못 쟀으면 FAIL로 둔다.** 붐빔을 근거로 내리는 것이므로 근거가 없으면
  // 못 내린다. 통과로 바꾸는 것이 아니라 **의심을 유지하는** 쪽이다
  if (busy.known !== true) return { verdict: 'FAIL', why: `붐빔을 못 쟀다 — ${busy.why}` }
  if (busy.value !== true) return { verdict: 'FAIL', why: `기계는 안 붐볐다 (${busy.why})` }
  return { verdict: 'BLOCKED', kind: '경합', why: `기계가 붐볐다 — ${busy.why}` }
}
