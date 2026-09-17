// 대표 구간 — **새 게임부터 첫 배지까지 정상 입력으로** 간다 (PLATINUM_3D_COMPLETION_PLAN §7 · PT-03)
//
//     pnpm journey                   개발 서버를 띄워 처음부터 몬다
//     pnpm journey --url=http://…    이미 떠 있는 서버를 쓴다
//     pnpm journey --budget=5400     초 (기본 5400 = 90분)
//
// ⚠️ **확인 지점을 주입하지 않는다.** `pnpm story`는 여든여덟 자리로 **뛰어들어**
// 그 장면이 서는지를 보는 검사고, 여기서 재는 것은 **걸어서 이어지는가**다.
// 둘은 다른 것을 증명한다 — 장면이 다 서도 그 사이가 안 이어질 수 있다
// (기획서 §1.4 「장면 체크포인트 통과와 정상 스토리 완주를 분리한다」).
// 그래서 이 파일은 `warpTo`도 `window.pt`도 안 쓴다. 쓰는 것은 방향키·A·B와
// 화면의 진짜 단추뿐이고, 보는 것은 `<html>`의 읽기 전용 표식이다.
//
// ⚠️ **읽는 것과 넣는 것은 다르다.** 배지 수와 자리는 개발 서버에서 모듈을
// 열어 **읽기만** 한다 (`story.mjs`가 확인 지점 표를 읽는 것과 같은 자리다).
// 진행은 한 걸음도 그렇게 만들지 않는다.
//
// ⚠️ **리포트는 화면의 그 길로 쓴다.** 시작 메뉴 → 리포트 → 「예」다.
// `pt.report()`(개발 손잡이)를 안 쓴다 — 사람이 하는 길에서만 「덮어쓸까요」와
// 백업 다운로드가 같이 일어나고, 그 둘이 이 구간의 납품물이다.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { freePort, knock, startVite } from '../devServer.mjs'
import { gpuArgs, probeGpu } from '../gpuFlags.mjs'
import { driveStory, playOpening } from './drive.mjs'
import { looksFlat, statsOf } from '../shot/png.mjs'
import { WATCH_INIT, looksDrawn, missingShots, shootCanvas } from './canvasShot.mjs'
import { judgeTerrain } from './terrainJudge.mjs'
import { stageState, waitTerrain } from './stageProbe.mjs'
import { SPY } from './perfSpy.mjs'
import { LOAD_SPY, startLoadSpy } from './loadSpy.mjs'
import { classify, INFRA, SHAPE, SLOW } from './budget.mjs'
import { missingData, trainersOn } from './route.mjs'
import { resumableAt, writeSegment } from './segments.mjs'
import {
  bindingDigest, dataDigest, describeEnvironment, rosterOf, sealEvidence,
} from '../distribution/evidence.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? null : hit.slice(name.length + 3)
}
/**
 * ⚠️ **10800이다 (3시간).** 구간이 **둘째 배지**까지 늘었다 —
 * 축복시티에서 꽃향기마을 한 다리만으로 실측 20분이 넘는다(2026-09-16 `_eter42`:
 * 427걸음 · 쉰 바퀴 0). 5400으로는 영원의 숲에 닿기 전에 예산이 끝난다.
 *
 * ⚠️ **한 판이 저절로 길어지지는 않는다.** 다리마다의 상한에 `api.left()`가 늘
 * 함께 걸리므로, 이 값을 올리는 것은 남은 시간을 **쓸 수 있게** 하는 것뿐이다
 */
const BUDGET_MS = Number(flag('budget') ?? 10800) * 1000
/**
 * **어느 구간부터 이어 달릴까** (`--from=09`). 진단을 빠르게 하려는 값이다.
 *
 * ⚠️ **최종 판정용 판에는 안 쓴다.** 지시서와 검토가 함께 못 박은 자리다 —
 * 최종 `journey`는 **새 게임부터** 정상 진행으로 돈다. 여기서 건너뛴 구간은
 * 결과 줄에 **안 들어가므로** 봉투의 `executedCases`에서 빠지고, 집계에
 * **미실행**으로 잡힌다 (`_tally42.mjs`). 전체 PASS에 안 보탠다.
 *
 * ⚠️ **신원이 다르면 조용히 전체를 돈다** (`tools/e2e/segments.mjs`) —
 * 소스·하네스·이야기 표·세이브 넷을 다 본다
 */
const FROM = flag('from')

/**
 * **이상한사탕 지름길** (`--candy` · 기본 꺼짐 · `docs/orders/RARE_CANDY_20260917.md`).
 *
 * 켜면 **안 밟는 것**이 둘이다 —
 *
 *   · ⑲ 앞 레벨 맞추기(205번도로 남쪽 야생전 · 상한 900초)를 사탕으로 채운다
 *   · 유채 앞에서 찌르꼬를 사탕으로 L16까지 올린다(L14 찌르버드) — 원래는 없던 걸음이다
 *
 * 사탕을 **가방에 넣는 것만** 개발 모듈로 하고, 먹이는 것은 가방 → 파티 화면 →
 * 진화 화면을 키로 넘긴다(`drive.feedCandy`).
 *
 * ⚠️ **진단 판이다.** 봉투의 `scope.shortcuts`에 `candy`가 적히고, 판정기가 그 판을
 * 스스로 떨어뜨린다(`evidence.validateEvidence`) — ⑪·⑦에 못 들어간다. 구간 세이브도
 * 이름과 신원이 따로라(`seg-NN-candy`) 사탕 판끼리만 이어 달린다.
 * **기록용 판은 깃발 없이 돈다**
 */
const CANDY = args.includes('--candy')
const SHORTCUTS = CANDY ? ['candy'] : []
/** 사탕 판에서 유채 앞 찌르꼬를 올릴 레벨 — L14 진화 · 날개치기는 L9 */
const CANDY_STARLY_LEVEL = 16
/** 이상한사탕 (`items.json` 50 · 약 주머니) */
const RARE_CANDY = 50
const MEDICINE_POCKET = 1
const STARLY = 396

/**
 * 다 돌면 내야 할 정본 목록과, **돌기 시작할 때의 나무 지문.**
 *
 * ⚠️ **둘 다 하네스 밖에서 온다** (기획서 §6.1). 목록을 여기 적어 두면 「시험
 * 하나를 빼면서 목록도 같이 빼는」 한 번의 편집이 통과를 만든다.
 * `startDigest`는 **도중에 src를 고쳤는가**를 잡는다 — 개발 서버가 HMR로
 * 갈아 끼우면 앞뒤 걸음이 서로 다른 게임에서 재어진다
 */
const EXPECTED_CASES = rosterOf('journey')?.cases ?? null
const START_DIGEST = bindingDigest('journey')
/** 도는 동안 자료가 바뀌었는지 보려고 시작 지문을 같이 든다 (지시 §7) */
const dataAtStart = dataDigest()

if (EXPECTED_CASES === null) {
  console.error('\n정본 case 목록을 못 냈다 — tools/distribution/evidence.mjs를 본다\n')
  process.exit(1)
}
const SHOTS = resolve(ROOT, 'shots/journey')
const SAVES = resolve(ROOT, '.audit/journey')
const VIEW = { width: 960, height: 640 }

/**
 * 대표 구간이 지나는 자리. **맵 번호는 확인 지점 표에서 온 값이다**
 * (`src/engine/dev/checkpoints.ts`) — 여기서 새로 짓지 않는다.
 *
 * ⚠️ **탄광이 체육관보다 먼저다.** 원작에서 관장은 처음에 체육관에 없다 —
 * 무쇠탄광에 있고, 거기서 만나야 체육관이 열린다. 순서를 뒤집으면 「체육관에
 * 갔는데 아무도 없다」를 게임의 결함으로 적게 된다
 */

/**
 * 축복시티에서 **동쪽 길을 여는 것**. 원작의 차례 그대로다.
 *
 * ⚠️ **여기를 건너뛰면 무쇠시티에 영영 못 간다.** 실측(3·4판)으로 480초 동안
 * (187,760)에서 오른쪽만 누르다 섰다 — 막은 것은 지형이 아니라 이야기다.
 * 원본 자료가 그대로 말한다:
 *
 * · `events_jubilife_city.json` — 동쪽 출구 (188, 757~760)에
 *   `VAR_JUBILIFE_CITY_STATE == 1`일 때만 도는 좌표 이벤트가 있고, 그것이
 *   `JubilifeCity_CoordEvent_LookerBlockRoute203`다. 핸섬이 걸어와 말을 걸고
 *   주인공을 **서쪽으로 되돌려 세운다**
 * · `scripts_jubilife_city.s` — 그 값을 2로 올리는 자리는 온 게임에 **하나**,
 *   `JubilifeCity_GivePoketch`뿐이다
 * · `scripts_trainers_school.s` — 사장과 광대 ①②는 처음에 **없다**
 *   (`scripts_init_new_game.s`가 숨김 깃발을 세운다). 트레이너 스쿨에서
 *   라이벌에게 **소포를 건네야** `ClearFlag`로 셋이 나타나고 캠페인이 1이 된다
 *
 * 그래서 차례가 이렇다 —
 *
 *   ① 트레이너 스쿨(맵 4)에서 라이벌에게 말을 건다 (소포 → 타운맵)
 *   ② 포켓치사 사장 앞(172~176, 776)을 지난다 → 「광대 셋을 찾아라」
 *   ③ 광대 셋에게 **셋 다 「예」**로 답한다 → 쿠폰 셋
 *   ④ 사장에게 말을 걸어 포켓치를 받는다 → 동쪽이 열린다
 *
 * ⚠️ **사람은 자리가 아니라 스크립트 번호로 찾는다** (`api.talkToNpc`).
 * 광대 둘은 `MOVEMENT_TYPE_WANDER_AROUND`라 배치표 자리에 안 서 있고, 사장은
 * 좌표 이벤트가 주인공 쪽으로 걸어오게 만든다 — 실측(진단 탐침)으로 배치표
 * 자리로 찾으니 셋 중 둘에게 「말을 못 걸었다」가 났다
 */
const JUBILIFE = {
  /**
   * 트레이너 스쿨. 라이벌은 그 맵의 스크립트 1번이다.
   *
   * ⚠️ **29다.** 한 번 4로 적었다가 프렌들리숍에 들어가 엉뚱한 사람과 말했고,
   * 「말을 걸었다」가 뜨는데 깃발은 그대로였다. 번호는 `generated/map_headers.txt`의
   * 차례로 정해진다 (`MAP_HEADER_EVERYWHERE`가 0) — 4는 `JUBILIFE_CITY_MART`,
   * 29가 `TRAINERS_SCHOOL`이고, 그 맵의 (6,3)에 숨김 깃발 500(=
   * `FLAG_HIDE_TRAINERS_SCHOOL_RIVAL`)을 단 사람이 라이벌이다
   */
  school: { map: 29, rival: 1 },
  /** 사장이 알아보는 자리. 폭 5(172~176)의 한가운데를 밟는다 */
  campaign: { x: 174, z: 776 },
  clowns: [
    { script: 14, what: '광대 ①' },
    { script: 15, what: '광대 ②' },
    { script: 16, what: '광대 ③' },
  ],
  president: { script: 18, what: '포켓치사 사장' },
}

/**
 * 그 자리에서 **말을 걸어야 하는 사람들**. 트레이너 표에 없는 이들이다.
 *
 * 관장 로안은 탄광에서 먼저 만나고(원작 순서), 체육관에서 도전한다. 둘 다
 * `trainerType: 0`이라 `trainersOn()`으로는 안 나온다 — 오래 말을 건 적이 없다
 */
const NPC_STOPS = {
  198: [{ script: 7235, what: '관장 로안' }],
  47: [{ script: 1, what: '관장 로안에게 도전' }],
  // 영원 체육관 넷. 꽃시계가 하나씩 열리므로 **이 차례를 지켜야** 닿는다
  67: [
    { script: 5, what: '트① 캐롤라인' },
    { script: 6, what: '트② 제나' },
    { script: 7, what: '트③ 앤젤라' },
    { script: 4, what: '관장 유채' },
  ],
}

/**
 * 지면 **한 번 더** 도전하는 관장 — 맵 → 스크립트와 이기면 되는 배지 수.
 * 스크립트 번호는 `NPC_STOPS`의 관장 줄과 같다
 */
const LEADER_RETRY = {
  47: { script: 1, badges: 1, what: '관장 로안' },
  67: { script: 4, badges: 2, what: '관장 유채' },
}

/**
 * 그 자리 앞에서 들를 **포켓몬센터 1F**. 간호사는 그 맵 스크립트의 첫 항목이다
 * (`*_Nurse`가 첫 `ScriptEntry` — `scripts_jubilife_city_pokecenter_1f.s`).
 *
 * ⚠️ **「그 자리로 떠나기 전에」 들를 센터**다. 무쇠(45)로 떠날 때는 아직
 * 축복시티에 있으므로 축복 센터(6)고, 탄광·체육관으로 갈 때는 무쇠 센터(48)다.
 * 여기를 뒤집으면 쓰러진 채로 도시 하나를 걸어가게 된다
 */
/**
 * **한 사람에게 말 거는 데 쓸 상한 — 필수와 곁가지를 가른다.**
 *
 * ⚠️ **상한을 필수 단계에만 걸어 놓으면 안 된다.** 한동안 이 파일에서 40초
 * 상한이 붙은 자리가 **포켓치 사슬 하나뿐**이었다 — 광대 셋과 사장, 즉
 * 원작이 동쪽을 여는 조건으로 삼은 **필수** 단계다. 그래서 상한이 하는 일이
 * 「진단을 빨리 끝낸다」가 아니라 **「필수 이벤트를 시간으로 생략한다」**가
 * 됐다.
 *
 * 실측이 그 경계를 그대로 보여 준다 — 같은 40초로 한 판은 광대 셋이 다
 * 걸렸고(쿠폰 3/3 · 포켓치 켜짐), 다음 판은 **광대 ②에서 떨어져** 쿠폰 2/3에
 * 멎었다(2026-09-08). 광대 둘은 `MOVEMENT_TYPE_WANDER_AROUND`라 돌아다니고,
 * `talkToNpc`는 예산을 `tries`로 쪼개되 바닥이 20초라 **40초면 두 바퀴**다 —
 * 축복시티를 가로질러 한 번 다가가는 데만 그만큼 든다.
 *
 * 그렇다고 상한이 없으면 반대쪽으로 넘어진다: 한 명당 180초를 네 번까지
 * 따라다녀 90분 예산이 축복시티에서 탔고, 무쇠시티·탄광·체육관이 **전부**
 * 「시간이 다 됐다 · 멈춘 맵 3」으로 떨어졌다.
 *
 * 그래서 **둘로 가른다** — 필수는 넉넉히 주되 **사슬 전체**에 상한을 걸어
 * 한 판을 통째로 삼키지 못하게 한다. 어느 쪽이든 끊는 것은 시간이지 판정이
 * 아니다: 실패는 이유와 함께 `missed`·`trouble`과 아래 줄들에 그대로 남는다.
 */
/**
 * ⚠️ **150초도 아직 필수 단계를 잘라내고 있었다.** 실측(2026-09-09 판정용 판):
 * 광대 ①을 끝낸 자리가 (183,767)이고 광대 ②는 (143,754)다 — **서쪽으로 마흔 칸**을
 * 스물여덟 명이 오가는 도시를 가로질러 간다. `talkToNpc`는 예산을 `tries`로 쪼개니
 * 150초면 한 바퀴에 37초고, 첫 바퀴를 길 막힘에 쓰면 둘째 바퀴가 못 닿는다.
 * 그 판은 광대 ②에서 「못 걸었다」로 떨어져 쿠폰 2/3에 멎었고, 그래서 포켓치도
 * 동쪽도 첫 배지도 함께 무너졌다(⑨⑩⑪⑫).
 *
 * ⚠️ **게임이 막은 것이 아니다.** 같은 세이브로 `_jubi42`를 돌리면 광대 ②는
 * **두 바퀴에 걸리고** 쿠폰 3/3 · 도시단계 2 · 포켓치 켜짐 · 동쪽 통행 arrived까지
 * 그대로 간다. 끊은 것은 시간이다.
 *
 * ⚠️ **그런데 전체 예산은 5,400초인데 그 판은 1,120초에 끝났다.** 남는 70분을 두고
 * 필수 단계를 150초로 자르고 있었다는 뜻이다. 한 사람 300초 · 사슬 전체 1,200초로
 * 넓힌다 — 여전히 90분 중 20분이 상한이고, 끊는 것은 판정이 아니라 시간이며
 * 실패는 이유와 함께 남는다
 */
const STORY_TALK_MS = 300_000
/**
 * 포켓치 사슬(광대 셋 + 사장) **전체**에 쓸 상한.
 *
 * 넷이 저마다 `STORY_TALK_MS`를 다 쓰면 10분이다. 여기서 한 번 더 묶어 두면
 * 최악에도 그 이상은 안 간다 — 남는 시간은 무쇠로 걸어가는 데 쓴다
 */
const POKETCH_CHAIN_MS = 1_200_000
/**
 * 못 받은 쿠폰을 **몇 바퀴까지** 다시 도나.
 *
 * 돌아다니는 광대라 한 바퀴에 놓치는 일이 있다. 세 바퀴로 잡되 끊는 것은 늘
 * `POKETCH_CHAIN_MS`다 — 바퀴 수가 예산을 늘리지는 않는다
 */
const POKETCH_ROUNDS = 3

/**
 * ⚠️ **떠나기 전 지역의 센터다** (바로 위). 꽃향기로 떠날 때는 아직 축복시티라
 * 축복 센터(6)고, 숲으로 떠날 때는 꽃향기 센터(428)다. 영원시티로 떠나는
 * 자리도 숲 앞이라 428이고, 체육관 앞에서만 영원 센터(69)다 —
 * 실측(2026-09-16 `_eter42`)으로 **목적지 쪽 센터**를 적었다가 도착도 못 한 채
 * 300초를 태웠다
 */
const CENTERS = { 3: 6, 45: 6, 198: 48, 47: 48, 426: 6, 203: 428, 65: 428, 67: 69 }

/**
 * 모래시티 포켓몬센터 1층.
 *
 * `generated/map_headers.txt`의 차례로 419번 줄이 `MAP_HEADER_SANDGEM_TOWN`(=418)이니
 * `..._POKECENTER_1F`는 **420**이다. 떡잎마을에는 센터가 없어서, 집에서 축복시티로
 * 걷는 길에 들를 수 있는 첫 센터가 여기다
 */
const SANDGEM_CENTER = 420

const AFTER_STOPS = [
  { id: '08', map: 3, what: '축복시티' },
  { id: '09', map: 45, what: '무쇠시티' },
  { id: '10', map: 198, what: '무쇠탄광 (관장을 만나는 자리)' },
  { id: '11', map: 47, what: '무쇠 체육관' },
  // ── 여기부터 둘째 배지 (지시서 JOURNEY_BADGE2 §1) ──────────────────────
  { id: '18', map: 426, what: '꽃향기마을' },
  { id: '19', map: 203, what: '영원의 숲' },
  { id: '20', map: 65, what: '영원시티' },
  { id: '21', map: 67, what: '영원 체육관' },
]

/** 숲에 들기 전 선두 레벨 (진화 18을 넘고, 숲을 통과한 판의 L19~21에 맞춘다) */
const FOREST_LEVEL = 20
/** 그 레벨을 맞출 풀밭 — 205번도로 남쪽 */
const FOREST_GRASS = 347
/** 레벨 맞추기에 줄 시간의 상한 */
const FOREST_TRAIN_MS = 900_000

/** 축복시티 마트. 볼을 여기서 산다 — 꽃향기까지 가면 잡을 자리를 이미 지난다 */
const JUBILIFE_MART = 4
/** 몬스터볼. 도구 번호다 (`items.json` — 값 200원) */
const POKE_BALL = 4
/** 갤럭시단 장면이 도는 칸 — 축복시티 북쪽 (`JubilifeCity_CoordEvent_TeamGalactic`) */
const GALACTIC_TILE = { x: 173, z: 743 }
/** 잡으러 들르는 풀밭 — 204번도로 남쪽 */
const CATCH_MAP = 345
/**
 * **누구를 잡을까.** 사람이 여기서 고르는 그 둘이다 —
 * 찌르꼬는 비행이라 유채의 풀에 2배고, 비버니는 바위깨기를 배워 험한 샛길을 연다
 * (`species.json`의 기술머신 비트 97번 — 모부기·비버니는 서고 찌르꼬·꼬링크·꼬몽울은 안 선다)
 */
const CATCH_WANT = [
  { what: '찌르꼬', species: [396] },
  { what: '비버니', species: [399] },
]
/**
 * **벌레회피스프레이** (79 · 350원 · 100걸음).
 *
 * ⚠️ **이것이 없으면 다리가 안 끝난다.** 실측(2026-09-16 대표 구간, WebGL 판):
 * 영원의 숲과 205번도로에서 야생이 **한 다리에 열두 번** 붙었고, 걷는 도중에
 * 다리 상한이 끊겨 「나아가는 중에 총예산이 끝났다 (355번 나아갔다)」로 떨어졌다.
 * 막은 것은 길이 아니라 **싸운 시간**이다. 원작이 그 자리에 주는 답이 이 도구고
 * (마트 재고 t2라 배지 하나면 뜬다), 사람도 숲에 들어가기 전에 뿌린다
 */
const REPEL = 79
/** 자전거 (`items.ko.json` 450번 · 열쇠도구) */
const BICYCLE = 450
/**
 * 자전거가 없으면 못 지나는 맵 — **206번도로(자전거길)**.
 *
 * 영원시티의 자전거 가게는 이 구간 **뒤**에 열리므로 둘째 배지까지는 늘 닫혀 있다.
 * 그래도 못 박지 않고 가방으로 정한다 (`closedMaps`)
 */
const CLOSED_WITHOUT_BIKE = new Set([350])

/**
 * **영원 마트** (`C04FS0101`). 체육관 바로 옆이라 사람도 여기서 약을 산다
 */
const ETERNA_MART = 66
/**
 * **좋은상처약** (26 · 700원 · 50 회복).
 *
 * 배지 하나면 재고 계단이 2라 이것이 선다(`marts.json` · `bag/mart.ts`) —
 * 유채 자신이 쓰는 그 약이다(`leader_gardenia.json`에 둘)
 */
const SUPER_POTION = 26
/** 몇 개를 살까. 넷이면 2,800원이고, 유채가 쓰는 둘보다 둘 많다 */
const SUPER_POTIONS = 4
/**
 * 선두의 체력이 이 몫 아래면 약을 쓴다.
 *
 * ⚠️ **약은 턴을 쓴다** — 높게 잡으면 때리지 않고 약만 먹다 진다. 좋은상처약이
 * 50을 채우고 그 무렵 수풀부기의 최대 HP가 70 언저리라(실측 journey13 L24),
 * 0.45면 한 번 쓸 때 거의 다 찬다
 */
const POTION_FLOOR = 0.45
/** 몇 개를 살까. 여섯이면 600걸음이고 2,100원이다 (볼 열 개를 사고도 남는다) */
const REPELS = 6
/** 뿌리고 들어가는 자리 — 칸마다 야생이 붙는 바깥 길들 */
const REPEL_BEFORE = new Set([426, 203, 65])

/** 비전머신06과 바위깨기 (`items.txt`의 426번째 줄 · `tmhm.narc`의 97번) */
const HM06 = 425
const ROCK_SMASH = 249
/** 험한 샛길과 그 앞뒤 204번도로. 남쪽은 잡으러 가는 그 풀밭이다(`CATCH_MAP`) */
const RAVAGED_PATH = 254
const ROUTE_204_S = CATCH_MAP
const ROUTE_204_N = 346


/**
 * 구간 하나의 결말을 PASS·FAIL·BLOCKED로 가른다 (지시서 §1.1 「분류 규칙」).
 *
 * ⚠️ **BLOCKED는 통과가 아니다.** 그 구간은 조용한 기계에서 **다시 돌아야**
 * 하고, 다시 돌아 PASS가 되기 전에는 완료 조건이 안 선다. 여기서 하는 일은
 * 「이 실패로 게임을 의심할 것인가」를 가르는 것뿐이다.
 *
 * ⚠️ **시간 모양만 내려갈 수 있다.** 「느림 · 관측 불능」과 「예산이 다 돼
 * 안 밟았다」가 그것이다. **「멈췄다」는 안 내려간다** — 그것은 표식이
 * 90바퀴 동안 한 번도 안 바뀌었다는 뜻이고, 기계가 느리면 칸이 느리게라도
 * 바뀌지 아예 안 바뀌지는 않는다. 「길이 없다」·「표식이 안 맞는다」도 내용이다
 */
const stopVerdict = (v) => {
  if (v === 'arrived') return { status: 'PASS', why: null }
  const timeShaped = typeof v === 'string'
    && (v.startsWith(SLOW) || v.startsWith('시간이 다 됐다'))
  const r = classify(timeShaped ? SHAPE.time : SHAPE.content, loadSpy.peek())
  return { status: r.verdict, why: r.why }
}

let video = null
/** 이 판이 얼마나 붐볐나 (지시서 H4). 못 걷었으면 `null` — **0으로 안 접는다** */
let load = null
const rows = []
const add = (id, what, status, detail) => {
  rows.push({ id, what, status, detail })
  const mark = { PASS: '✓', FAIL: '✗', BLOCKED: '⛔' }[status]
  console.log(`  ${mark} ${id}  ${what}`)
  if (detail) console.log(`        ${detail}`)
}

const missing = missingData()
if (missing.length > 0) {
  console.error(`\n개발 산출물이 없다 — ${missing.slice(0, 3).join(' · ')}. pnpm extract가 먼저다\n`)
  process.exit(1)
}

rmSync(SHOTS, { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })
mkdirSync(SAVES, { recursive: true })

const url = flag('url') ?? await (async () => {
  const port = await freePort()
  const t0 = Date.now()
  const { url: at } = await startVite(port, 'node_modules/.vite-journey')
  console.log(`  개발 서버(${String(port)}) 준비됐다 — ${String(Math.round((Date.now() - t0) / 1000))}초\n`)
  return at
})()

/**
 * ⚠️ **기본이 `gl`이다.** 이 구간이 증명하는 것은 「**걸어서 이어지는가**」라
 * 백엔드와 무관한데, 실측(2026-09-16 `_pace42` A/B/A)으로 같은 길 넷을 걷는 데
 * **WebGPU 61·58초 · WebGL 28초**였다 — 두 배 넘게 차이 난다. 둘째 배지까지
 * 늘어난 구간을 WebGPU로 돌면 한 판이 두 시간을 넘긴다.
 *
 * ⚠️ **WebGPU를 안 재는 것이 아니다.** 게임 화면을 WebGPU로 증명하는 자리는
 * 따로 있다 — `pnpm story`가 확인 지점 여든여덟을 `WebGPUBackend`로 돌고
 * (실측 34.8분), `pnpm render:first`도 WebGPU 다섯 판이다. 여기서 재는 것은
 * 그 사이가 **이어지는가**고, `--gpu=webgpu`로 언제든 되돌린다.
 * 어느 쪽으로 돌았는지는 봉투의 `environment.backend`에 그대로 남는다
 */
const browser = await chromium.launch({ args: gpuArgs(flag('gpu') ?? 'gl') })
const browserVersion = browser.version()
// ⚠️ **영상은 납품물이다** (기획서 §7.3.3). 그림 여덟 컷은 「그 자리에 섰다」를
// 보이지만 **걷는 것과 싸우는 것**은 못 보인다 — 컷인 타이밍도, 대사창이
// 이중으로 넘어가는지도 정지 화면에서는 안 보인다. playwright는 맥락이 닫힐 때
// 파일을 쓰므로 `browser.close()`까지 가야 남는다
const page = await browser.newPage({
  viewport: VIEW,
  acceptDownloads: true,
  recordVideo: { dir: resolve(ROOT, 'shots/journey/video'), size: VIEW },
})
page.setDefaultNavigationTimeout(300_000)
// 찍는 동안 화면이 흔들렸는지 재는 자 (`tools/e2e/canvasShot.mjs`)
await page.addInitScript(WATCH_INIT)
/**
 * ⚠️ **⑯이 「오류 1건」으로만 남아 있었다.** 어느 부품의 어느 prop이 복제를 막았는지
 * 없이는 고칠 자리가 없다. `performance.measure`를 감싸 **터진 것만** 이름·prop·스택을
 * 적고 **원래 예외를 그대로 다시 던진다** — 콘솔도 안 가린다(⑯은 여전히 이 오류로
 * 떨어진다). 감싸는 값은 호출 하나당 함수 한 겹이다.
 *
 * ⚠️ **계측 없는 대조가 따로 있다** — 2026-09-08 판정용 판(계약 4)에는 이 줄이 없었다
 */
await page.addInitScript(SPY)
/**
 * **판이 도는 내내 부하를 잰다** (지시서 H4).
 *
 * ⚠️ **판정에 안 쓴다.** 낮은 fps 그 자체로는 아무 줄도 안 떨어뜨린다. 쓰이는
 * 자리는 둘뿐이다 — 시간 모양의 실패를 FAIL과 BLOCKED(경합)로 가르는 분류와,
 * 개발 서버·배포물의 분포를 나란히 놓는 §2.1의 비교다
 */
await page.addInitScript(LOAD_SPY)
const loadSpy = startLoadSpy(page)

/**
 * 콘솔이 조용한가. 게임이 도는 내내 듣는다.
 *
 * ⚠️ **`WebGPU`가 든 줄을 통째로 버리지 않는다.** 처음에 그렇게 걸렀는데,
 * 그 바람에 **진짜 첫 오류를 내가 버렸다** — 남은 258건은 전부 그 뒤에 딸려 온
 * 「이전 오류 때문에 무효」였고, 원인 줄은 `Uncaptured WebGPU GPUValidationError:
 * The resolve target … size does not match` 하나였다. 거르는 것은 **이름을
 * 아는 잡음만**이다
 */
const BENIGN = [
  /Download the React DevTools/,
  /\[vite\]/,
  // 크로미움이 윈도우에서 늘 찍는다 — 우리 코드와 무관하다
  /powerPreference option is currently ignored/,
  // three 0.185가 제 안에서 쓰면서 스스로 경고한다
  /THREE\.Clock: This module has been deprecated/,
]
/**
 * ⚠️ **WebGPU를 일부러 끈 판(`gl`)에서만** 폴백 알림 두 줄을 거른다. 끄면 three가
 * 반드시 찍는 말이라 게임의 흠이 아니다 — `story`·`saves`가 이미 같은 두 줄을 거른다.
 * 실측(2026-09-17 journey12·13): 기본을 `gl`로 바꾼 뒤 ⑯이 이 두 줄로만 떨어졌다.
 * `--gpu=webgpu`에서는 안 거른다 — 거기서 나오면 진짜로 WebGPU가 못 선 것이다
 */
if ((flag('gpu') ?? 'gl') === 'gl') {
  BENIGN.push(/WebGPU is not available, running under WebGL2 backend/, /Device failed at creation/)
}
const noise = []
/** `performance.measure` 감시자가 남긴 것. 봉투의 `extra`까지 가야 하니 밖에 둔다 */
let perfSpy = null
/**
 * ⚠️ **어디서 났는지를 같이 적는다.** 글만 300자로 잘라 두면 「누가 불렀나」를
 * 나중에 못 캔다 — `Performance.measure … Data cannot be cloned`가 정확히 그
 * 꼴이었다. 자리(파일·줄)와 스택 앞머리를 붙이고, 그때 화면이 무엇이었는지도
 * 적는다. 스택은 다섯 줄까지만 — 통째로 쏟지 않는다
 */
const at = (m) => {
  const l = m.location()
  return l?.url ? `${String(l.url).split('/').pop()}:${String(l.lineNumber)}:${String(l.columnNumber)}` : null
}
page.on('console', (m) => {
  if (m.type() !== 'error' && m.type() !== 'warning') return
  const text = m.text()
  if (BENIGN.some((re) => re.test(text))) return
  noise.push({ kind: m.type(), text: text.slice(0, 300), at: at(m), when: Date.now() })
})
page.on('pageerror', (e) => {
  noise.push({
    kind: 'pageerror', text: String(e.message).slice(0, 300), when: Date.now(),
    stack: String(e.stack ?? '').split('\n').slice(0, 5).join(' | ').slice(0, 600),
  })
})

const marks = () => page.evaluate(() => ({ ...document.documentElement.dataset }))

/**
 * 엔진이 들고 있는 **날것의 자리**와 세이브가 적어 둔 자리.
 *
 * ⚠️ **`data-tile`로는 ⑭를 못 잰다.** 그것은 내림한 칸이라 「같은 맵의 엉뚱한
 * 자리」가 통과한다. 그리고 견줄 기준은 새로고침 직전의 DOM이 아니라 **실제로
 * 저장한 값**이다 — 리포트를 쓴 뒤에 한 걸음 더 걸었으면 DOM이 앞서 있다
 */
const whereNow = () => page.evaluate(async () => {
  const w = await import('/src/engine/map/world.ts')
  const s = await import('/src/state/worldState.ts')
  const v = await import('/src/state/saveStore.ts')
  const p = s.worldState.player
  const save = v.useSaveStore.getState()
  return {
    world: { map: w.world.mapId, matrix: w.world.matrix, grid: w.world.grid !== null },
    player: { x: p.position.x, z: p.position.z, facing: p.facing },
    save: { ...save.position, loaded: save.loaded },
  }
})

async function tap(key, hold = 70) {
  await page.keyboard.down(key)
  await page.waitForTimeout(hold)
  await page.keyboard.up(key)
  await page.waitForTimeout(60)
}

let shotNo = 0
/**
 * 그림 한 컷 — **사람이 볼 화면 전체와, 판정에 쓸 캔버스만** 둘 다 찍는다.
 *
 * ⚠️ **화면 전체로는 「3D가 그려졌는가」를 못 잰다.** 계기판·대사창·타이틀이
 * 색을 채워서 캔버스가 한 픽셀도 안 나온 컷이 통과한다 — 실측(7판)으로 ⑮가
 * 그렇게 통과했고, 다시 재 보니 계기판만 남긴 컷의 색이 154~198개였다(문턱 64).
 * 그래서 판정은 **계기판을 숨기고 캔버스 요소만 찍은 컷**으로 한다
 * (`tools/e2e/canvasShot.mjs` — `pnpm render:first`와 같은 자를 쓴다).
 *
 * @param world 3D 무대가 서 있는 자리인가. 타이틀에는 캔버스가 아직 없다
 */
async function shot(name, { world = true } = {}) {
  shotNo += 1
  const head = `shots/journey/${String(shotNo).padStart(2, '0')}-${name}`
  /**
   * **찍기 전에 지형이 서기를 기다린다 — 시간이 아니라 상태를.**
   *
   * ⚠️ **`goTo`가 `arrived`를 준 것은 지형이 섰다는 뜻이 아니다.** 그것은 맵을
   * 갈아 끼우는 쪽의 신호고, 청크 모델은 그 뒤에 비동기로 온다
   * (`scene/terrainMark`가 그 경계를 밖으로 낸다).
   *
   * ⚠️ **상한을 넘으면 「판정 불가」지 「통과」가 아니다.** 여기서 못 서면
   * 그 시간만큼 **사용자도 빈 화면을 본 것**이고, 아래 `readiness`가 그것을
   * 그대로 남긴다
   */
  const readiness = world ? await waitTerrain(page, 20_000) : null
  const png = await page.screenshot({ path: resolve(ROOT, `${head}.png`) })
  const pix = statsOf(png)
  const one = {
    name, file: `${head}.png`, colors: pix.colors,
    stdev: Number(pix.stdev.toFixed(1)), flat: looksFlat(pix),
  }
  if (readiness !== null) one.readiness = readiness
  if (world) {
    // ⚠️ **컷만으로는 판정할 수 없다.** 「거의 한 색」인 컷이 렌더 결함인지,
    // 지형이 없는 자리에 서 있는 것인지는 **그때의 게임 상태**를 같이 봐야
    // 갈린다 — 실측으로 after-gym은 `tris 20.3k`가 나가는데 화면은 안개색
    // 한 장이었고, 그 자리는 맵이 아직 안 선 곳이었다
    one.state = await whereNow().catch(() => null)
    one.marks = await marks().catch(() => null)
    try {
      const at = `${head}-캔버스.png`
      const cut = await shootCanvas(page, { path: resolve(ROOT, at) })
      /**
       * ⚠️ **색 개수로 지형을 인정하지 않는다.** 실측(2026-09-08)에서 까만
       * 원반 위에 주인공만 뜬 컷과 바닥이 한 줄만 그려진 컷이 색 개수로는
       * **통과**했다. `terrainJudge`가 칸을 나눠 아래 두 줄을 본다
       * (`.audit/terrain-controls/`, `terrainJudge.test.mjs`).
       *
       * ⚠️ **계약 2다** (`JUDGE_CONTRACT`). 계약 1은 「무늬가 얼마나 센가」를
       * 봤고 그래서 **매끄러운 실내 장판을 거절했다.** 계약 2는 「가장자리까지
       * 무언가 있는가」를 본다. **옛 실행의 JSON에 적힌 판정과 안 섞는다** —
       * 그쪽은 계약 1의 값이라 `contract` 번호로 갈린다
       */
      const land = judgeTerrain(cut.png)
      one.canvas = {
        file: at, colors: cut.stats.colors, stdev: Number(cut.stats.stdev.toFixed(1)),
        // 옛 잣대도 같이 남긴다 — 두 자가 언제 갈리는지가 그대로 증거다
        flatOnly: looksDrawn(cut.stats), steady: cut.steady,
        contract: land.contract,
        drawn: land.drawn, filled: land.filled, roi: land.roi, voids: land.voids,
        ratio: land.ratio, landWhy: land.why,
      }
      one.stage = await stageState(page).catch(() => null)
      /**
       * **여기서 실패했으면 그 실행을 살려 둔 채 이어서 잰다** (지시 §2).
       *
       * ⚠️ **움직이지도, 크기를 흔들지도, 다시 들이지도 않는다.** 같은 페이지 ·
       * 같은 카메라 · 같은 자리에서 시간만 흘려보낸다. 나중에 채워지면 「촬영
       * 준비」 문제고, 끝내 안 채워지면 「씬·카메라·자료」 문제다.
       *
       * ⚠️ **최초 판정을 덮어쓰지 않는다.** `one.canvas.drawn`은 위에서 찍은
       * 첫 컷의 값 그대로다 — 아래 표는 `one.after`에만 쌓인다
       */
      if (!one.canvas.drawn) {
        one.after = []
        const t0 = Date.now()
        for (const sec of [0, 1, 3, 10, 30]) {
          const wait = sec * 1000 - (Date.now() - t0)
          if (wait > 0) await page.waitForTimeout(wait)
          const late = `${head}-이어서-${String(sec).padStart(2, '0')}초.png`
          const c = await shootCanvas(page, { path: resolve(ROOT, late) }).catch(() => null)
          if (c === null) { one.after.push({ sec, unobservable: '캔버스를 못 뗐다' }); continue }
          const j = judgeTerrain(c.png)
          one.after.push({
            sec, file: late, colors: c.stats.colors,
            stdev: Number(c.stats.stdev.toFixed(1)), drawn: j.drawn, filled: j.filled,
            stage: await stageState(page).catch(() => null),
          })
        }
        const late = one.after.filter((r) => r.drawn === true)
        console.log(`        ⚠️ 실패한 그 실행에서 30초를 더 봤다 —`
          + ` ${late.length === 0 ? '끝내 안 채워졌다' : `${String(late[0].sec)}초에 채워졌다`}`)
      }
      if (!one.canvas.drawn) {
        console.log(`        ⚠️ ${at} — 3D가 거의 한 색이다 (색 ${String(cut.stats.colors)})`
          + ` · 그때 ${JSON.stringify(one.state?.world ?? null)}`
          + ` ${String(one.state?.player?.x)},${String(one.state?.player?.z)}`
          + ` scene=${String(one.marks?.scene)}`)
      }
    } catch (e) {
      one.canvasWhy = String(e.message ?? e).slice(0, 120)
      console.log(`        ⚠️ ${name} — 캔버스를 못 뗐다: ${one.canvasWhy}`)
    }
  }
  return one
}

/**
 * 지금 상태를 **읽는다** — 배지·자리·파티.
 *
 * ⚠️ 개발 서버에서 모듈을 여는 것은 story.mjs가 확인 지점 표를 읽는 것과 같은
 * 자리다. **읽기만 한다** — 여기서 값을 넣으면 그 순간 이 검사는 뜻을 잃는다
 */
/**
 * **포켓치를 정말 받았는가.** 대화 반환값이 아니라 게임이 든 값으로 잰다.
 *
 * 원작의 계약(`scripts_jubilife_city.s`):
 * `JubilifeCity_SetObtainedCouponsCount`가 `FLAG_RECEIVED_COUPON_1..3`을 세고,
 * `GoToIfEq VAR_0x8004, 3, JubilifeCity_GivePoketch` → `GivePoketch`가
 * `SetVar VAR_JUBILIFE_CITY_STATE, 2`를 한다.
 *
 * ⚠️ **번호를 줄 셈으로 짐작하지 않는다.** 목록은 C enum처럼 세는 것이라
 * 줄 번호와의 차이가 **구간마다 다르다** — 실측(2026-09-08 `_jubi42`의 깃발
 * diff): 광대 셋이 세운 것은 **237·238·239**였고 사장이 세운 것은 **243**이었다.
 * 그 값들이 `FLAG_RECEIVED_COUPON_1`(줄 240)·`FLAG_RECEIVED_POKETCH`(줄 246)와
 * **줄 −3**으로 맞고, 이미 확정된 `FLAG_HAS_POKEDEX = 144`(줄 147)도 같은 −3이다.
 * 한때 −7로 적었다가 엉뚱한 깃발 셋을 읽었다(그 −7은 목록 **뒤쪽** 구간의 값이다).
 *
 * 변수는 `VAR_JUBILIFE_CITY_STATE = 16503`이고, 이건 **동작으로** 확인됐다 —
 * 사장에게 말을 건 순간 1에서 2로 올랐다(원작의 `GivePoketch`가 하는 그 일이다).
 *
 * ⚠️ **읽기만 한다.**
 */
const poketchNow = () => page.evaluate(async () => {
  const f = await import('/src/engine/script/field.ts')
  const save = await import('/src/state/saveStore.ts')
  const v = f.fieldScripts.vars
  const s = save.useSaveStore.getState()
  return {
    coupons: [237, 238, 239].map((n) => v.checkFlag(n)),
    /** `FLAG_RECEIVED_POKETCH` — 사장이 실제로 준 자리 */
    received: v.checkFlag(243),
    cityState: v.get(16503),
    /**
     * `VAR_POKETCH_CAMPAIGN_STATE = 16615`.
     *
     * ⚠️ **광대 ③은 이 값에 걸려 있다** — 원작
     * (`scripts_jubilife_city.s:1578`)이
     * `GoToIfLt VAR_POKETCH_CAMPAIGN_STATE, 2`면 "좀 더 둘러보라"로 빠지고
     * 쿠폰을 **안 준다.** 그래서 이 값이 없으면 「말은 걸었는데 쿠폰이 안 는다」의
     * 까닭을 못 가른다 — 못 만난 것인지, 만났는데 관문에 걸린 것인지.
     *
     * ⚠️ **번호는 두 앵커로 확인했다.** 목록(`vars_flags.txt`)에서
     * `VAR_UNK_0x4072`(줄 4225)와 `VAR_UNUSED_0x40EA`(줄 4345)가 둘 다
     * 줄 4342를 `0x40E7 = 16615`로 가리킨다. 같은 셈이 이미 확정된
     * `VAR_JUBILIFE_CITY_STATE = 16503`(줄 4230)도 맞힌다
     */
    campaign: v.get(16615),
    enabled: s.poketch.enabled,
  }
})

const readSave = () => page.evaluate(async () => {
  const m = await import('/src/state/saveStore.ts')
  const s = m.useSaveStore.getState()
  let badges = 0
  for (let i = 0; i < 8; i++) if ((s.badges >> i) & 1) badges += 1
  return {
    badges,
    party: s.party.length,
    dex: s.trainer.name === '' ? 0 : 1,
    trainer: s.trainer.name,
    playtimeMs: s.trainer.playtimeMs,
    loaded: s.loaded,
  }
})

/** 대사·스크립트가 걷힐 때까지 A를 누른다 */
async function settle(taps = 120) {
  for (let i = 0; i < taps; i++) {
    const m = await marks()
    if (m.scene === 'overworld' && m.talk !== '1' && m.script !== '1' && m.menu === undefined) return true
    await tap('Space')
  }
  return false
}

/**
 * 시작 메뉴에서 **리포트**를 열어 쓴다 — 사람이 하는 그 길이다.
 *
 * ⚠️ **항목 글로 못 찾는다.** 시작 메뉴의 이름표는 롬에서 오므로 판마다 다르다
 * (`ui/menu/StartMenu`의 `label()`). 대신 **차례**로 찾는다 — 리포트는 늘
 * 뒤에서 셋째다(리포트 · 설정 · 닫기). 고르는 줄이 `radiogroup`으로 자기 칸과
 * 커서를 내주므로 거기서 세고, 실제로 열렸는지는 `data-menu`로 확인한다.
 *
 * ⚠️ **눈 감고 A를 연타하지 않는다.** 설정 안에 「리포트를 지우고 처음부터」가
 * 있어서, 아무 칸이나 눌러 보는 방식은 **진행을 지울 수 있다**
 */
async function writeReport(saveAs) {
  await settle()
  await tap('KeyC')
  try {
    await page.waitForSelector('[role="radiogroup"] [role="radio"]', { timeout: 15_000 })
  } catch {
    return { ok: false, why: '시작 메뉴가 안 열렸다' }
  }
  const items = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')]
    return { n: all.length, at: all.findIndex((e) => e.getAttribute('aria-checked') === 'true') }
  })
  const first = await items()
  const want = first.n - 3
  if (want < 0) return { ok: false, why: `시작 메뉴 칸이 ${String(first.n)}개뿐이다` }
  for (let i = 0; i < first.n + 3; i++) {
    const now = await items()
    if (now.at === want) break
    await tap(now.at < want ? 'ArrowDown' : 'ArrowUp')
  }
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }).catch(() => null),
    (async () => {
      await tap('Space') // 리포트를 연다
      for (let i = 0; i < 30; i++) {
        if ((await marks()).menu === 'save') break
        await page.waitForTimeout(200)
      }
      // 「작성할까요?」 · 「덮어써도 괜찮습니까?」 — 기본 칸이 「예」다
      for (let i = 0; i < 20; i++) await tap('Space')
    })(),
  ])
  if (download === null) return { ok: false, why: '리포트를 써도 백업 파일이 안 내려왔다' }
  const at = resolve(SAVES, saveAs)
  await download.saveAs(at)
  // 화면을 닫고 필드로 돌아온다
  for (let i = 0; i < 8 && (await marks()).menu !== undefined; i++) await tap('KeyX')
  return { ok: true, file: `.audit/journey/${saveAs}`, name: download.suggestedFilename() }
}

/** 첫 화면이 뜰 때까지 (cold) */
async function openTitle() {
  const t0 = Date.now()
  // ⚠️ **playwright 기본 30초로는 첫 `goto`가 떨어진다.** vite는 「ready」를
  // 찍은 뒤로도 모듈 그래프를 계속 미리 변환하고, 그동안 첫 `goto`는 붙잡혀
  // 있다 — 실측으로 캐시가 찬 판에서도 34초에 떨어졌다 (`tools/shot/shot.mjs`의
  // 같은 자리)
  /**
   * ⚠️ **가기 전에 서버가 사는지부터 본다** (지시서 H3). 여기서 `goto`가
   * 죽으면 판 전체가 ⑨⑨ FAIL로 끝나고, 그 줄은 밖에서 **게임의 실패**로
   * 읽힌다 — 서버가 안 대답하는 것은 게임이 틀린 것이 아니다.
   *
   * ⚠️ **상한이 판정을 대신하지 않는다.** 아래 상한은 「서버가 아직 굽고 있다」와
   * 「게임이 안 열린다」를 가르는 값일 뿐이고, 늦게 열린 판도 늦었다고 적힌다
   */
  const alive = await knock(url)
  if (!alive.ok) {
    throw new Error(`${INFRA} 개발 서버가 대답을 안 한다 (${url}`
      + ` · ${String(alive.why)} · ${String(alive.ms)}ms) — 게임을 안 열었다`)
  }
  /**
   * ⚠️ **180초로는 붐비는 기계에서 첫 쪽이 안 온다.** vite는 「준비됐다」를 찍은
   * 뒤에도 모듈 그래프를 계속 변환하고, 첫 `goto`가 그 뒤를 기다린다 —
   * 실측(2026-09-16 `_title42`) 한가한 나무에서 **154초**였고,
   * 실측(2026-09-17 journey9) `pnpm check` 바로 뒤의 붐비는 나무에서는
   * **180초를 넘겨** 판이 통째로 「검사가 끝까지 갔다 FAIL」로 떨어졌다 —
   * 게임은 열어 보지도 못한 채였다. 아래 「시작」 기다림과 같은 300초로 맞춘다
   */
  await page.goto(url, { waitUntil: 'load', timeout: 300_000 })
  const start = page.getByRole('button', { name: '시작', exact: true })
  /**
   * ⚠️ **120초로는 붐비는 기계에서 문이 안 열린다.** 실측(2026-09-16 `_title42`):
   * 같은 나무에서 개발 서버가 「준비됐다」를 찍는 데 140초, 그 뒤 첫 `goto`가
   * **154초**였고 — vite는 ready를 찍은 뒤에도 모듈 그래프를 계속 변환한다 —
   * 「시작」은 goto가 끝나자 **0초에** 떴다. 콘솔 오류는 0건이었다.
   * 그런데 대표 구간 두 판이 바로 이 자리에서 ⑨⑨ FAIL로 끝났고, 그 줄은
   * 밖에서 **게임의 실패**로 읽힌다.
   *
   * ⚠️ **숨기는 것이 아니다.** 걸린 시간은 `timings.coldTitleMs`에 그대로
   * 남고, 오래 걸린 판은 §2.1의 비교에서 드러난다. 여기서 재는 것은
   * 「화면이 뜨는가」지 「몇 초에 뜨는가」가 아니다
   */
  await start.waitFor({ timeout: 300_000 })
  return { ms: Date.now() - t0, start }
}

let gpu = null
let backend = null
const story = { }
const timings = {}
const shots = []
let ranToTheEnd = false

/**
 * `--from`이 가리키는 구간에서 이어 달려도 되는가 — **신원까지 맞을 때만.**
 *
 * ⚠️ **안 되면 조용히 전체를 돈다.** 다만 왜 못 이어 달리는지는 화면에 적는다 —
 * 「신원이 다르다」로만 적으면 다음 사람이 무엇이 바뀌었는지 다시 찾아야 한다
 */
const resume = FROM === null ? { ok: false, segment: null, why: '' } : resumableAt(FROM, SHORTCUTS)
if (CANDY) console.log('  ⚠️ --candy — 레벨을 사탕으로 채우는 **진단 판**이다. 봉투가 이 판을 통과로 안 받는다')
if (FROM !== null) {
  console.log(resume.ok
    ? `  구간 ${resume.segment.id}에서 이어 달린다 — ${resume.segment.save}`
      + ` (적어 둔 때 ${resume.segment.verifiedAt})`
    : `  구간 ${FROM}에서 못 이어 달린다 — ${resume.why}
  → 새 게임부터 전부 돈다`)
  if (resume.ok) {
    console.log('  ⚠️ 이 판은 **진단**이다 — 건너뛴 구간은 미실행이고 전체 PASS에 안 보탠다')
  }
}

try {
  // ── ① 첫 화면 ────────────────────────────────────────────────────────────
  const title = await openTitle()
  timings.coldTitleMs = title.ms
  shots.push(await shot('title', { world: false }))
  add('01', '첫 화면이 뜬다', 'PASS', `${String(title.ms)}ms (cold)`)

  // ── ② 새 게임 → 오프닝을 정상 입력으로 끝낸다 ─────────────────────────────
  const t1 = Date.now()
  if (resume.ok) {
    /**
     * **적어 둔 자리에서 이어 달린다.** 정상 UI로 들인다 — 리포트를 고르는
     * 그 길이다. ②③은 **안 만든다**: 이 판은 오프닝을 지나지도, 시작
     * 리포트를 쓰지도 않았으므로 그 줄을 PASS로 적으면 거짓이 된다.
     * 결과에서 빠지면 봉투가 그것을 **미실행**으로 적는다
     */
    await page.setInputFiles('input[type=file]', resolve(ROOT, resume.segment.save))
    const bring = page.getByRole('button', { name: '이 리포트로 이어하기' })
    await bring.waitFor({ timeout: 60_000 })
    await bring.click()
    await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
    await page.waitForSelector('canvas', { timeout: 120_000 })
    await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
      && document.documentElement.dataset.restoring === undefined, null, { timeout: 180_000 })
    gpu = await probeGpu(page)
    backend = (await marks()).backend ?? null
    await settle()
    console.log(`    구간 ${resume.segment.id}에 섰다 — ${JSON.stringify(await marks())}`)
  } else {
  await title.start.click({ timeout: 60_000 })
  await page.waitForFunction(() => location.pathname === '/intro', null, { timeout: 60_000 })
  const after = await playOpening(page)
  if (after !== '/play') throw new Error(`오프닝이 안 끝났다 — ${after}`)
  await page.waitForSelector('canvas', { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 120_000 })
  timings.openingMs = Date.now() - t1
  gpu = await probeGpu(page)
  backend = (await marks()).backend ?? null
  await settle()
  shots.push(await shot('bedroom'))
  add('02', '새 게임에서 오프닝을 정상 입력으로 끝낸다', 'PASS',
    `${String(Math.round(timings.openingMs / 1000))}초 · ${JSON.stringify(await marks())}`)

  // ── ③ 시작 리포트 ────────────────────────────────────────────────────────
  const startSave = await writeReport('start.rpsave')
  const startState = await readSave()
  add('03', '시작 자리에서 리포트를 쓰고 파일로 받는다', startSave.ok ? 'PASS' : 'FAIL',
    startSave.ok ? `${startSave.file} (${startSave.name}) · ${JSON.stringify(startState)}`
      : String(startSave.why))
  }

  // ── ④~⑦ 파트너·라이벌·야생·상점·트레이너 (이미 있는 드라이버) ────────────
  const log = (line) => { console.log(`    ${line}`) }
  /**
   * **끝날 수 있는 상한.** 예산이 다 돼도 안 끝난 판이 있었다.
   *
   * 실측(2026-09-09 두 번째 판): 걸음 예산이 다 됐다고 적힌 **뒤에도** 야생
   * 배틀 줄만 스물일곱까지 이어지고 다른 줄이 10분 동안 안 나와서 사람이 끊었다.
   *
   * ⚠️ **그것이 「안 끝난다」의 증거는 아니다.** `api.left() <= 0`인 자리는
   * 로그를 안 남기고 건너뛰므로, 그 침묵은 「조용히 건너뛰는 중」일 수도 있다.
   * `fightThrough`도 `started + totalMs`를 본다. 무한 고리를 짚었다고 안 적는다.
   *
   * 그래도 **검사에는 끝날 수 있는 상한이 있어야 한다.** 예산에 5분을 얹은
   * 자리에서 끊고, 끊긴 사실을 결과에 그대로 적는다(통과로 접지 않는다).
   * 브라우저는 `finally`가 닫으므로 버려진 드라이버도 거기서 멎는다
   */
  const HARD_STOP_MS = BUDGET_MS + 300_000
  let hardStop = null
  /** 지금 꽃시계가 막고 있는 칸. 체육관에 들어설 때와 한 판마다 다시 읽는다 */
  let gymWalls = new Set()
  /**
   * 가방에 자전거가 있나 (`closedMaps`가 본다).
   *
   * ⚠️ **없다고 시작한다.** 모르는 채로 열어 두면 자전거길로 다시 걸어 들어간다 —
   * 못 읽는 것을 「열려 있다」로 접지 않는다
   */
  let hasBike = false
  const drive = await Promise.race([
    driveStory(page, {
    log,
    totalMs: Math.max(600_000, BUDGET_MS - (Date.now() - t1)),
    /**
     * **꽃시계가 막는 칸.** 우리 격자(`route.mjs`)는 타일 통행만 알아서 시계
     * 바늘을 모른다 — 상태 0에서 제품이 막는 168칸을 격자는 대부분 걸을 수
     * 있다고 한다. 그대로 계획하면 시계를 뚫고 가는 길이 나오고, 밖에서는
     * 「길은 있는데 안 걸어진다」로 보인다 (지시서 §3.2).
     *
     * ⚠️ **표를 하네스가 다시 세지 않는다.** 제품이 실제로 쓰는
     * `scene/eternaGym.ts`의 `eternaBlockedAt`을 **읽어서** 쓴다.
     * 트레이너를 하나 이길 때마다 시계가 돌므로 그때마다 다시 읽는다
     */
    obstacles: (mapId, x, z) => mapId === 67 && gymWalls.has(`${String(x)},${String(z)}`),
    /**
     * **아직 못 지나는 맵** — 자전거가 없으면 자전거길(206번도로)이 안 열린다.
     *
     * ⚠️ 격자는 맞닿은 것만 안다. 실측(2026-09-17 journey17): 숲에서 전멸해
     * 축복 센터로 밀린 판이 영원시티로 돌아갈 때 맵 그래프가 무쇠 → 207번도로 →
     * **자전거길**을 냈고, 207번도로 (306,720)에서 **18분 동안 같은 자리**를
     * 맴돌았다 — 계획은 늘 「17걸음 있다」고 하고 게임은 늘 막았다.
     *
     * ⚠️ **가방을 읽어서 정한다.** 「이 구간에는 자전거가 없다」로 못 박으면
     * 자전거를 받은 뒤의 판에서 거짓이 된다. 못 읽으면 **닫아 둔다** — 열어
     * 두면 다시 18분을 맴돈다
     */
    closedMaps: () => (hasBike ? null : CLOSED_WITHOUT_BIKE),
    // 이어 달리는 판은 이야기 길목을 다시 안 걷는다 — 이미 그 자리에 서 있다
    skipStory: resume.ok,
    after: async (api) => {
      const seen = []
      /** 트레이너 표에 없는 사람들을 실제로 만났는가 */
      const metNpcs = []
      /** 영원 체육관에서 꽃시계가 어떻게 열렸나 (㉑의 근거) */
      const clock = []
      /** 회복하러 들른 기록 */
      const heals = []
      /** 벌레회피스프레이를 언제 뿌렸나 */
      const sprays = []
      // ⚠️ **여기부터는 소포가 있어야 한다.** 원작이 202번도로 입구에서 막는다 —
      // 소포가 없으면 라이벌이 "가족한테 말은 하고 왔니"라며 되돌려 세우고,
      // 그것도 **들어설 때마다 다시**다 (`Route202_CheckStartCatchingTutorial`).
      // `driveStory`는 트레이너전이 0일 때만 이 걸음을 밟으므로, 라이벌전이
      // 이미 붙은 판에서는 건너뛴다 — 실측으로 축복시티·무쇠시티·탄광 셋이
      // **전부 맵 343에서** 막혔고 로그에 「엄마에게」 줄이 없었다
      await api.getParcel()
      await api.settle()
      log(`소포를 받으러 다녀왔다 — 지금 ${JSON.stringify(await marks())}`)
      // ── 축복시티: 포켓치를 받아 동쪽을 연다 (원작 차례. 위 JUBILIFE 참고) ──
      const poketch = { done: false, why: '' }
      if (api.left() > 0) {
        /**
         * ⚠️ **쓰러진 채로 202번도로를 건너면 안 된다.**
         *
         * 실측(2026-09-09 두 번째 판): 소포 심부름 끝에 파티가 상해 있었고,
         * 그대로 축복시티로 걸었더니 **야생을 스물두 번** 만났다 — 도중에
         * 전멸해 집으로 되돌려 보내지고, 다시 같은 풀밭을 걷고, 또 만난다.
         * 900초 예산이 그 되돌이에 다 들어가 「축복시티에 못 닿았다」로 떨어졌고
         * 포켓치 사슬은 **한 번도 안 돌았다**. 같은 판의 첫 번째 실행은 야생이
         * 다섯 번이라 그냥 지나갔다 — 끊은 것은 게임이 아니라 **운과 예산**이다.
         *
         * 그래서 걷기 전에 **모래시티 센터(420)**에서 낫는다. 원작에서 사람이
         * 하는 것과 같고, 못 가면 그 사실을 적고 그대로 걷는다 — 건너뛰지 않는다
         */
        const before = await api.partyState()
        if (!api.fullyHealed(before).ok) {
          const healed = await api.healAt(SANDGEM_CENTER, Math.min(300_000, api.left()))
          heals.push({ where: '축복시티로 걷기 전', center: SANDGEM_CENTER, ...healed })
          log(`  걷기 전 회복 (센터 ${String(SANDGEM_CENTER)}) → ${healed.ok ? '나았다' : String(healed.why)}`)
        }
        // ⚠️ 이 한 걸음이 **집(414)에서 축복시티까지**다 — 202번도로를 통째로
        // 지난다. 480초로는 모자랐다 (실측 5판)
        const got = await api.goTo(3, Math.min(900_000, api.left()))
        log(`축복시티(3) → ${got}`)
        if (got !== 'arrived') {
          poketch.why = `축복시티에 못 닿았다 (${got})`
        } else {
          const inSchool = await api.goTo(JUBILIFE.school.map, Math.min(240_000, api.left()))
          const metRival = inSchool === 'arrived'
            && await api.talkToNpc(JUBILIFE.school.map, JUBILIFE.school.rival,
              Math.min(180_000, api.left()))
          await api.clearTalk()
          await api.settle()
          log(`  트레이너 스쿨(${String(JUBILIFE.school.map)}) → ${inSchool}`
            + ` · 라이벌 ${metRival === true ? '에게 소포를 건넸다' : '을 못 만났다'}`)
          const back = await api.goTo(3, Math.min(240_000, api.left()))
          const met = back === 'arrived'
            ? await api.stepOn(3, JUBILIFE.campaign, Math.min(180_000, api.left()))
            : '안 갔다'
          await api.clearTalk()
          await api.settle()
          // ⚠️ **밟았다는 것과 장면이 돌았다는 것은 다르다.** 그 칸의 좌표
          // 이벤트(`events.json` 표 2의 script 17 · `var 16615 == 1`)가 도는
          // 것이 목적이고, 그것이 캠페인 단계를 2로 올린다 — 광대 ③이 그
          // 값에 걸려 있다. 밟기 결말만 적으면 그 차이가 안 남는다
          const camp = (await poketchNow()).campaign
          log(`  사장 앞(${String(JUBILIFE.campaign.x)},${String(JUBILIFE.campaign.z)}) → ${met}`
            + ` · 캠페인단계 ${String(camp)}`)
          /** 사슬 전체의 마감. 넷이 나눠 쓴다 */
          const chainTill = Date.now() + Math.min(POKETCH_CHAIN_MS, Math.max(0, api.left()))
          /** 이 사람에게 줄 시간 — 사슬 마감과 전체 예산 둘 다에 걸린다 */
          const chainRoom = () => Math.min(STORY_TALK_MS, chainTill - Date.now(), api.left())
          /**
           * ⚠️ **한 바퀴로 끝내지 않는다.** 광대 둘은 `MOVEMENT_TYPE_WANDER_AROUND`라
           * 스물여덟 명이 오가는 도시를 돌아다닌다. 실측(2026-09-17 journey15):
           * 한 바퀴에 ①②를 **둘 다 놓쳤고**, 사슬 예산 1,200초 중 대부분이 남았는데도
           * 쿠폰 1/3으로 사장에게 갔다 — 그러면 동쪽이 안 열려 **첫 배지부터** 무너지고
           * 둘째 배지 사슬이 통째로 죽는다 (그 판이 그렇게 갔다).
           *
           * **못 받은 쿠폰만** 다시 돈다. 판정은 말을 걸었는가가 아니라 **쿠폰 칸이
           * 섰는가**다 — 말은 걸었는데 안 주는 자리(캠페인 단계가 안 오른 광대 ③)가
           * 있어서, 대화 반환값으로 세면 안 걸린 것을 걸린 것으로 적는다
           */
          const coupon = (bag2, i) => bag2.coupons[i] === true
          for (let round = 1; round <= POKETCH_ROUNDS; round++) {
            let bag2 = await poketchNow()
            if (bag2.coupons.filter(Boolean).length === 3) break
            let tried = 0
            for (const [i, clown] of JUBILIFE.clowns.entries()) {
              if (coupon(bag2, i)) continue
              if (chainRoom() <= 0) { log(`  ${clown.what} → 사슬 예산이 다 됐다`); continue }
              tried += 1
              const said = await api.talkToNpc(3, clown.script, chainRoom())
              await api.clearTalk()
              await api.settle()
              bag2 = await poketchNow()
              log(`  ${clown.what}${round > 1 ? ` (${String(round)}번째)` : ''}`
                + ` → ${said ? '말을 걸었다' : '못 걸었다'}`
                + ` · 쿠폰 ${bag2.coupons.filter(Boolean).length}/3`
                + ` · 캠페인단계 ${String(bag2.campaign)}`)
            }
            // 한 바퀴에 아무도 못 갔으면 더 돌아도 같다 — 예산만 태운다
            if (tried === 0) break
          }
          const said = chainRoom() > 0
            && await api.talkToNpc(3, JUBILIFE.president.script, chainRoom())
          await api.clearTalk()
          await api.settle()
          /**
           * ⚠️ **말을 걸었다는 것은 받았다는 뜻이 아니다.**
           *
           * 원작의 계약은 `scripts_jubilife_city.s`에 그대로 있다 —
           * `JubilifeCity_SetObtainedCouponsCount`가 `FLAG_RECEIVED_COUPON_1..3`을
           * 세고 **셋이 다 서야** `JubilifeCity_GivePoketch`가 돌아
           * `VAR_JUBILIFE_CITY_STATE`를 2로 올린다. 그래서 판정은 **받은 것**으로
           * 한다: 쿠폰 셋 · 도시 단계 2 · 포켓치 보유.
           *
           * 예전에는 `poketch.done = gave === true`였다 — 대화 반환값 하나로
           * 「받았다」를 적었다는 뜻이고, 그러면 말만 걸고 못 받은 판이
           * 통과로 새어 나간다
           */
          const bag = await poketchNow()
          poketch.done = bag.coupons.filter(Boolean).length === 3
            && bag.received && bag.cityState === 2 && bag.enabled
          poketch.said = said === true
          poketch.state = bag
          poketch.why = poketch.done ? ''
            : !said ? '사장에게 말을 못 걸었다'
              : bag.coupons.filter(Boolean).length < 3
                ? `쿠폰이 ${bag.coupons.filter(Boolean).length}/3이라 안 준다`
                : `말은 걸었는데 못 받았다 (도시단계 ${String(bag.cityState)})`
          log(`  ${JUBILIFE.president.what} → ${said ? '말을 걸었다' : '못 걸었다'}`
            + ` · 쿠폰 ${bag.coupons.filter(Boolean).length}/3`
            + ` · 도시단계 ${String(bag.cityState)}`
            + ` · 지급표시 ${bag.received ? '섰다' : '안 섰다'}`
            + ` · 포켓치 ${bag.enabled ? '켜졌다' : '안 켜졌다'}`)
        }
      }

      /**
       * **필수 단계가 무너지면 종속 구간을 무작정 걷지 않는다.**
       *
       * 축복시티 동쪽(203번도로)은 포켓치를 받아야 열린다 —
       * `JubilifeCity_CoordEvent_LookerBlockRoute203`이
       * `VAR_JUBILIFE_CITY_STATE == 1`인 동안 핸섬을 걸어오게 해 주인공을
       * **서쪽으로 되돌려 세운다.** 그 값을 2로 올리는 자리는 온 게임에
       * `JubilifeCity_GivePoketch` 하나뿐이다.
       *
       * ⚠️ **이것은 봐주는 것이 아니다.** 못 간 자리는 그대로 FAIL이고, 다만
       * 이유가 「시간이 다 됐다」가 아니라 **「동쪽이 잠겼다」**로 남는다 —
       * 앞엣것은 원인을 가리고 뒤엣것은 가리키다. 그리고 900초씩 세 번을
       * 벽에 대고 쓰지 않으므로 뒤 항목들이 잴 시간이 남는다
       */
      /**
       * ⚠️ **잠겼는지는 「재서」 안다 — 짐작으로 건너뛰지 않는다.**
       *
       * 원작은 `JubilifeCity_CoordEvent_LookerBlockRoute203`이
       * `VAR_JUBILIFE_CITY_STATE == 1`인 동안 동쪽을 막는다. 벽이 아니라
       * **스크립트가 밀어낸다** — 핸섬이 플레이어의 z로 걸어와 말을 건 뒤
       * `JubilifeCity_Movement_PlayerWalkWestWithLooker`로 서쪽으로 되민다.
       *
       * ⚠️ **203번도로는 344다. 343은 202번도로다** (`maps.json`의 `R203`·`R202`).
       * 한동안 이 자리가 **343으로 물어보고 있었다** — 즉 「동쪽이 열렸는가」를
       * 물으면서 **이미 걸어온 서쪽 길**을 짚었고, 당연히 늘 `arrived`가 나왔다.
       * 그 값 하나로 「우리 게임은 포켓치 없이도 동쪽에 닿는다」는 문장이 섰고,
       * 그것이 다시 「원작 게이트가 우리 쪽에 안 선다」는 의심으로 이어졌다.
       * **둘 다 그 오타에서 나온 것이다.**
       *
       * 344로 바로잡고 실측하니 원작대로 막힌다 (`_east42`, 도시단계 1 ·
       * 쿠폰 2/3): 제품의 `triggerAt`이 (188, 757~760) 네 칸에서 **script 3**을
       * 그대로 풀고, 동쪽으로 밀면 스크립트가 서면서 187로 되밀려 344에
       * 못 나간다.
       *
       * 그래도 **짐작으로 접지 않고 한 번 밀어 본다.** 막히면 그때 종속 구간을
       * 원인과 함께 접고, 열려 있으면 평소대로 걷는다
       */
      const ROUTE_203 = 344
      const eastProbe = poketch.done ? 'received'
        : api.left() > 0 ? await api.goTo(ROUTE_203, Math.min(120_000, api.left()))
          : '시간이 다 됐다'
      const eastLocked = eastProbe !== 'received' && eastProbe !== 'arrived'
      log(`  동쪽(203번도로 ${String(ROUTE_203)}) 통행 시험 → ${eastProbe}`
        + `${eastLocked ? ' — 잠겼다고 본다' : ''}`)
      poketch.east = eastProbe
      /** 축복시티 **동쪽**이라 포켓치가 있어야 닿는 자리들 */
      const EAST_OF_JUBILIFE = new Set([45, 198, 47])
      /** 축복시티 **북쪽**이라 204번도로를 지나야 닿는 자리들 */
      const NORTH_OF_JUBILIFE = new Set([426, 203, 65, 67])
      /** 북쪽이 실제로 열렸는가 — **걸어 보고** 한 번만 정한다 */
      let northProbe = null

      /**
       * `--from=<id>`가 가리키는 자리 **앞의** 구간들. 건너뛰면 결과 줄을
       * **안 만든다** — 그래야 봉투의 `executedCases`에서 빠져 「미실행」이 된다
       */
      const skipBefore = resume.ok ? resume.segment.id : null

      /**
       * **꽃향기로 떠나기 전에 해야 하는 것** (지시서 §1 ②③ · §3.3).
       *
       * 원작이 정한 차례다 — 배지 하나를 받으면 `VAR_JUBILIFE_CITY_STATE`가
       * 3이 되고, 그제야 축복시티 북쪽 (173,743)의 좌표 이벤트가 갤럭시단
       * 둘을 부른다. 이기면 그 값이 **4**가 되고 북쪽이 열린다.
       *
       * 그 김에 **파티를 꾸린다.** 첫 배지 자리의 세이브는 모부기 하나에
       * 몬스터볼 여섯이고(실측), 유채는 모부기 L20 · 체리꽃 L20 · 로즈레이드
       * L22에 좋은상처약 둘을 쓴다 — 한 마리로는 진다. 원작이 준 답이
       * **잡는 것**이라 마트에서 볼을 사고 204번도로 남쪽에서 잡는다
       * (찌르꼬는 비행이라 유채의 풀에 2배다).
       *
       * ⚠️ **레벨 노가다로 넘지 않는다.** 그것은 사람이 안 하는 길이고,
       * 「포획 후 저장·복원」(기획서 §7.2)을 이 구간이 처음 재는 자리이기도 하다
       */
      /**
       * 선두가 `level`에 닿을 때까지 `grass` 맵의 풀밭에서 싸운다. 체력이 반 아래면
       * `center`에서 낫고 돌아온다. 예산이 다 되면 그대로 적고 넘어간다(건너뛰지 않는다)
       */
      const trainBefore = async (level, grass, center, budgetMs) => {
        const till = Date.now() + budgetMs
        let fights = 0
        const leadLevel = async () => ((await api.partyState()) ?? [])[0]?.level ?? 0
        const from = await leadLevel()
        if (from >= level) return `이미 L${String(from)}`
        while (Date.now() < till && api.left() > 0) {
          if (await leadLevel() >= level) break
          const party = (await api.partyState()) ?? []
          const lead = party[0]
          if (lead === undefined || lead.hp * 2 < lead.max || party.every((m) => m.hp <= 0)) {
            const healed = await api.healAt(center, Math.min(300_000, till - Date.now()))
            if (!healed.ok) return `회복을 못 했다 (${String(healed.why)}) · ${String(fights)}판 · L${String(from)}→${String(await leadLevel())}`
          }
          const there = await api.goTo(grass, Math.min(300_000, till - Date.now()))
          if (there !== 'arrived') return `풀밭에 못 갔다 (${there}) · ${String(fights)}판`
          const how = await api.grindForWild(grass, Math.min(180_000, till - Date.now()))
          if (how === 'battle') fights += 1
        }
        const to = await leadLevel()
        return `${to >= level ? '됐다' : '시간이 다 됐다'} · ${String(fights)}판 · L${String(from)}→${String(to)}`
      }

      /**
       * **사탕으로 올린다** (`--candy`에서만). `slot`이 null이면 `species`인 첫 마리다.
       * 모자란 만큼만 가방에 넣고 화면으로 먹인다. 결과는 한 줄 글로 돌려준다 —
       * 레벨 맞추기와 같은 자리(`story.training`)에 적힌다
       */
      const candyUp = async (slot, species, level) => {
        const party = (await api.partyState()) ?? []
        const seen = party.map((one) => `${String(one.species)} L${String(one.level)}`)
        const at = slot ?? party.findIndex((one) => one.species === species
          || (species === STARLY && one.species === STARLY + 1))
        const mon = party[at]
        /**
         * ⚠️ **「못 했다」와 「할 자리가 없었다」를 가른다** (지시서
         * JOURNEY21_NEXT_DECISIONS §2). 찌르꼬를 못 잡은 판에서는 이 걸음이
         * **미실행**이지 실패가 아니다 — 그때의 실제 파티를 같이 적는다.
         * 대신 잡기를 한 번 더 하거나 선두를 더 올리지 않는다
         */
        if (mon === undefined) {
          return { ran: false, why: '먹일 마리가 파티에 없다', party: seen, fed: 0 }
        }
        const need = level - mon.level
        if (need <= 0) return { ran: false, why: `이미 L${String(mon.level)}`, party: seen, fed: 0 }
        const stocked = await page.evaluate(async ([pocket, item, n]) => {
          const m = await import('/src/state/saveStore.ts')
          return m.useSaveStore.getState().addItem(pocket, item, n)
        }, [MEDICINE_POCKET, RARE_CANDY, need]).catch((e) => `넣기 실패 ${String(e?.message ?? e)}`)
        if (stocked !== true) {
          return { ran: false, why: `사탕을 못 넣었다 (${String(stocked)})`, party: seen, fed: 0 }
        }
        const fed = await api.feedCandy(at, level, Math.min(900_000, api.left()))
        return {
          ran: true, ok: fed.ok, why: fed.why ?? null, party: seen, fed: fed.fed,
          from: `${String(mon.species)} L${String(mon.level)}`,
          to: `${String(fed.species ?? '?')} L${String(fed.level ?? '?')}`,
          asks: fed.asks ?? [], ms: fed.ms ?? null,
        }
      }

      /** 사탕 걸음 하나를 한 줄 글로 — 로그에 적히는 그 줄이다 */
      const candyLine = (got) => (got.ran
        ? `${got.ok ? '됐다' : `못 했다 (${String(got.why)})`} · 사탕 ${String(got.fed)}알`
          + ` · ${got.from}→${got.to} · ${String(Math.round((got.ms ?? 0) / 1000))}초`
        : `**미실행** — ${got.why} (파티 ${JSON.stringify(got.party)})`)

      /**
       * ⚠️ **영원 체육관에서는 한 판마다 낫는다.** 실측(2026-09-17 journey12):
       * 수풀부기가 **L25**였는데도 부하 둘을 이긴 피해를 안고 셋째(앤젤라)에게 져서
       * 꽃시계가 2에 멈췄다. 체육관에는 동행 회복(§9)이 없고, 들어설 때 한 번만
       * 나았다. 영원 센터(69)가 코앞이라 사람도 부하 사이에 낫는다.
       * 만피면 안 간다. 다녀온 뒤에는 체육관으로 돌아온다
       */
      const healBetween = async (what) => {
        const party = await api.partyState()
        if (api.fullyHealed(party).ok) return
        const got = await api.healAt(CENTERS[67], Math.min(300_000, api.left()))
        heals.push({ where: `${what} 앞 (체육관 안)`, center: CENTERS[67], ...got })
        const back = got.ok ? await api.goTo(67, Math.min(300_000, api.left())) : 'skipped'
        log(`  ${what} 앞 회복 (센터 ${String(CENTERS[67])}) → ${got.ok ? '나았다' : String(got.why)} · 돌아옴 ${back}`)
      }

      /** 체육관 앞에서 약을 샀나 */
      let potionBuy = null
      const north = { scene: null, bought: null, caught: [] }
      const goNorth = async () => {
        if (api.left() <= 0) { north.scene = '시간이 다 됐다'; return }
        const back = await api.goTo(3, Math.min(600_000, api.left()))
        if (back !== 'arrived') { north.scene = `축복시티로 못 돌아왔다 (${back})`; return }
        // ① 볼을 산다 — 잡을 자리(204 남쪽)를 지나기 **전에** 들른다
        north.bought = await api.buyAt(JUBILIFE_MART, POKE_BALL, 10,
          Math.min(300_000, api.left()))
        log(`  축복 마트(${String(JUBILIFE_MART)}) 몬스터볼 열 개 → `
          + `${north.bought.ok ? `${String(north.bought.bought)}개 샀다 (가진 것 ${String(north.bought.have)})`
            : String(north.bought.why)}`)
        // 같은 마트에서 **벌레회피스프레이**도 산다 (바로 위 참고)
        north.repels = await api.buyAt(JUBILIFE_MART, REPEL, REPELS,
          Math.min(300_000, api.left()))
        log(`  축복 마트 벌레회피스프레이 ${String(REPELS)}개 → `
          + `${north.repels.ok ? `${String(north.repels.bought)}개 샀다 (돈 ${String(north.repels.money?.[1])}원)`
            : String(north.repels.why)}`)
        /**
         * ③ **누구를 잡을지 고른다.** 나온 것마다 던지면 안 된다 —
         * 실측(`_north42`)으로 두 번 다 꼬몽울(풀)이 잡혔고, 그것은 유채에게도
         * 쓸모가 없고 비전머신06도 못 배운다. 204번도로 남쪽 표(`encounters.json`
         * 143번)에서 우리가 찾는 둘은 **찌르꼬**(비행 — 유채의 풀에 2배)와
         * **비버니**(바위깨기를 배운다 — 험한 샛길을 여는 마리다)
         */
        for (const who of CATCH_WANT) {
          if (api.left() <= 600_000) break
          /**
           * ⚠️ **상한 마리로 풀밭을 돌지 않는다.** 실측(2026-09-16 `_north42`):
           * 모부기 하나로 찌르꼬를 기다리다 무쇠 센터(48)로 되돌려 보내졌다.
           * 사람도 잡으러 가기 전에 낫는다 — 축복시티 센터가 바로 옆이다
           */
          const hurt = await api.partyState()
          if (!api.fullyHealed(hurt).ok) {
            const got2 = await api.healAt(CENTERS[426], Math.min(240_000, api.left()))
            heals.push({ where: `${who.what}을 잡으러 가기 전`, center: CENTERS[426], ...got2 })
            log(`  잡기 전 회복 (센터 ${String(CENTERS[426])}) → ${got2.ok ? '나았다' : String(got2.why)}`)
          }
          const came = await api.goTo(CATCH_MAP, Math.min(300_000, api.left()))
          if (came !== 'arrived') { north.caught.push({ ok: false, why: `풀밭에 못 갔다 (${came})` }); break }
          const got = await api.catchInGrass(CATCH_MAP, Math.min(600_000, api.left()), 12, who.species)
          north.caught.push({ what: who.what, ...got })
          const party = await api.partyState()
          // ⚠️ **찾던 것이 아니라 들어온 것을 적는다.** 실측(2026-09-16)으로
          // 비버니를 잡고도 「찌르꼬 잡았다」로 적힌 판이 있었다
          log(`  ${who.what} → ${got.ok ? `${String(got.got)}을 잡았다` : `못 잡았다 (${String(got.why)})`}`
            + ` · 만난 것 ${JSON.stringify((got.met ?? []).map((one) => one.species))}`
            + ` · 파티 ${JSON.stringify((party ?? []).map((one) => one.species))}`)
          if (!got.ok && String(got.why).startsWith('가방에 몬스터볼이')) break
        }

        /**
         * ③ **갤럭시단 둘과 붙는다** — 잡기가 **끝난 뒤**다.
         *
         * ⚠️ **차례를 바꾼 까닭이 실측이다** (2026-09-16 WebGL 판): 모부기
         * 한 마리로 이 자리에 섰다가 **전멸해 무쇠 센터(48)로 밀려났고**,
         * 도시단계가 3에 머물러 그 뒤가 통째로 무너졌다. 204번도로 남쪽은
         * 이 장면 없이도 갈 수 있다 — 같은 판이 거기서 비버니를 잡아 증명했다.
         * 사람도 그렇게 한다: 잡아서 머릿수를 채우고 나서 붙는다.
         *
         * ⚠️ **원작보다 어려운 자리다.** 원작은 라이벌과 함께 싸우는 태그
         * 배틀인데 우리는 1:1로 줄여 두었다 (`scene/fieldServices`의
         * `startTagBattle` — 알려진 축소다). 그래서 혼자 둘을 감당한다.
         *
         * 지면 낫고 **한 번 더** 간다 — 원작에서 사람이 하는 그대로다
         */
        for (let round = 0; round < 2 && api.left() > 300_000; round++) {
          const was = await api.storyVars()
          if (was?.jubilife === 4) { north.scene = 'arrived'; north.vars = { was: 4, now: 4 }; break }
          if (round > 0) {
            const again = await api.healAt(CENTERS[426], Math.min(240_000, api.left()))
            heals.push({ where: '갤럭시단 재도전 앞', center: CENTERS[426], ...again })
            log(`  갤럭시단 재도전 앞 회복 → ${again.ok ? '나았다' : String(again.why)}`)
          }
          const stood = await api.goTo(3, Math.min(300_000, api.left())) === 'arrived'
            ? await api.stepOn(3, GALACTIC_TILE, Math.min(300_000, api.left()))
            : '축복시티로 못 갔다'
          await api.clearTalk()
          await api.settle()
          const nowVars = await api.storyVars()
          north.scene = stood
          north.vars = { was: was?.jubilife ?? null, now: nowVars?.jubilife ?? null }
          log(`  갤럭시단 장면 (${String(GALACTIC_TILE.x)},${String(GALACTIC_TILE.z)})`
            + `${round > 0 ? ' 재도전' : ''} → ${stood}`
            + ` · 도시단계 ${String(was?.jubilife ?? '?')}→${String(nowVars?.jubilife ?? '?')}`
            + ` · 파티 ${JSON.stringify(((await api.partyState()) ?? []).map((one) => `${String(one.species)} L${String(one.level)}`))}`)
          if (nowVars?.jubilife === 4) break
        }

        /**
         * ④ **바위깨기를 가르치고 ⑤ 험한 샛길을 연다.**
         *
         * ⚠️ **여기가 원작의 관문이다.** 204번도로 남쪽에서 북쪽으로 가려면
         * 험한 샛길(254)을 지나야 하는데, (19,50)으로 들어와 (28,44)로 나가는
         * 길목 (23,44)에 `OBJ_EVENT_GFX_ROCK_SMASH`가 서 있다. 실측(2026-09-16
         * 대표 구간 한 판)으로 하네스가 그 앞 (22,44)에서 **314번을 나아가고도**
         * 못 나갔다 — 막은 것은 우리 결함이 아니라 원작이고, 빠진 것은 기술이었다.
         *
         * 비전머신06은 무쇠게이트 1층 등산가가 배지 하나를 보고 이미 줬다
         * (`OreburghGate1F_HikerGiveHM` — 첫 배지 자리 가방에 들어 있다).
         */
        north.taught = await api.teachHm(HM06, ROCK_SMASH, Math.min(300_000, api.left()))
        log(`  바위깨기를 가르친다 → ${north.taught.ok ? `${String(north.taught.slot)}번째가 배웠다` : String(north.taught.why)}`)
        if (api.left() > 300_000) {
          const inCave = await api.goTo(RAVAGED_PATH, Math.min(300_000, api.left()))
          north.cave = inCave
          if (inCave === 'arrived') {
            north.smash = await api.smashWay(RAVAGED_PATH, ROUTE_204_N, Math.min(600_000, api.left()))
            log(`  험한 샛길의 바위 → ${north.smash.ok ? '길이 열렸다' : String(north.smash.why)}`
              + ` (${String(north.smash.broke.length)}개 건드렸다)`)
          } else log(`  험한 샛길(${String(RAVAGED_PATH)}) → ${inCave}`)
        }
      }

      /** 가방을 읽어 자전거 여부를 새로 적는다. 못 읽으면 **그대로 둔다**(닫힌 채) */
      const noteBike = async () => {
        const bag = await api.bagState()
        if (bag !== null && Array.isArray(bag.items)) {
          hasBike = bag.items.some((one) => one.item === BICYCLE && one.count > 0)
        }
      }
      for (const stop of AFTER_STOPS) {
        await noteBike()
        // ⚠️ **북쪽 다리는 꽃향기 앞에서 딱 한 번 연다.** 이 걸음을 건너뛰면
        // 204번도로가 아직 잠겨 있어 뒤의 넷이 전부 「길이 없다」로 떨어진다
        if (stop.id === '18' && north.scene === null && !(skipBefore !== null && stop.id < skipBefore)) {
          await goNorth()
        }
        if (skipBefore !== null && stop.id < skipBefore) {
          log(`${stop.what}(${String(stop.map)}) → 건너뛴다 (미실행 · --from=${skipBefore})`)
          continue
        }
        if (api.left() <= 0) {
          // ⚠️ **조용히 건너뛰지 않는다.** 이 자리가 말이 없어서, 예산이 다 된
          // 판을 밖에서 「멎었다」로 읽고 사람이 끊은 적이 있다 (2026-09-09)
          log(`${stop.what}(${String(stop.map)}) → 시간이 다 됐다 — 안 밟는다`)
          seen.push({ ...stop, verdict: '시간이 다 됐다' })
          continue
        }
        /**
         * ⚠️ **북쪽이 안 열렸으면 벽에 대고 예산을 쓰지 않는다.**
         *
         * 204번도로로 나가는 문은 `VAR_JUBILIFE_CITY_STATE == 4`에서만 열린다 —
         * 그 값을 4로 올리는 자리는 갤럭시단 둘을 이기는 것 하나뿐이고, 그것도
         * 배지 하나(3)가 있어야 시작한다. 못 열렸으면 그 뒤 넷은 **걸어갈 길이
         * 아예 없다.**
         *
         * ⚠️ **봐주는 것이 아니다.** 그 줄들은 그대로 떨어지고, 이유가
         * 「시간이 다 됐다」가 아니라 **「북쪽이 잠겼다」**로 남는다
         */
        /**
         * ⚠️ **잠겼는지는 「재서」 안다 — 변수로 짐작하지 않는다.**
         *
         * 한동안 이 자리가 `VAR_JUBILIFE_CITY_STATE`가 4가 아니면 뒤 넷을
         * 통째로 접었다. 실측(2026-09-16 WebGL 판)이 그 짐작을 깼다: 같은 판이
         * 「북쪽이 잠겼다」로 넷을 접어 놓고, **그 전에 204번도로 남쪽에서
         * 비버니를 잡고 험한 샛길(254)의 바위까지 깼다.** 길은 열려 있었고
         * 잠근 것은 이 줄이었다.
         *
         * 원작이 북쪽에 두는 것은 벽이 아니라 **장면**이다. 그래서 동쪽(포켓치)
         * 자리와 똑같이 한다 — **한 번 밀어 보고**, 정말 못 가면 그때 접는다.
         * 접을 때도 이유에 갤럭시단 장면의 결말을 같이 적는다
         */
        if (NORTH_OF_JUBILIFE.has(stop.map) && northProbe === null) {
          northProbe = await api.goTo(ROUTE_204_S, Math.min(300_000, api.left()))
          log(`  북쪽(204번도로 남 ${String(ROUTE_204_S)}) 통행 시험 → ${northProbe}`
            + ` · 도시단계 ${String((await api.storyVars())?.jubilife ?? '?')}`)
        }
        if (NORTH_OF_JUBILIFE.has(stop.map) && northProbe !== 'arrived') {
          const why = `북쪽에 못 나갔다 (${String(northProbe)}`
            + ` · 도시단계 ${String(north.vars?.now ?? '?')}`
            + ` · 갤럭시단 ${String(north.scene ?? '안 갔다')})`
          log(`${stop.what}(${String(stop.map)}) → ${why}`)
          seen.push({ ...stop, verdict: why, at: null })
          api.trouble.push(`${stop.what}: ${why}`)
          continue
        }
        if (eastLocked && EAST_OF_JUBILIFE.has(stop.map)) {
          const why = `동쪽이 잠겼다 (${eastProbe}) — 포켓치를 못 받았다 (${String(poketch.why)})`
          log(`${stop.what}(${String(stop.map)}) → ${why}`)
          seen.push({ ...stop, verdict: why, at: null })
          api.trouble.push(`${stop.what}: ${why}`)
          continue
        }
        /**
         * ⚠️ **쓰러진 채로 다음 자리로 가지 않는다.** 전멸하면 원작은 마지막
         * 회복 자리로 되돌려 보내는데, 그것을 안 보면 하네스는 「걷다 길을
         * 잃었다」로 읽는다 — 실측(2026-09-07)으로 축복시티에서 무쇠로 가랬더니
         * 떡잎마을(411)에 서 있었고, 세 자리를 8분씩 헤매다 끝났다.
         *
         * ⚠️ **체육관 앞에서는 늘 회복한다.** 사람도 그렇게 한다. 관장은 12~14
         * 레벨 셋이라 반쯤 깎인 채로 들어가면 진다
         */
        const before = await api.partyState()
        const need = api.fullyHealed(before)
        const hurt = before.some((p) => p.hp <= 0)
        const center = CENTERS[stop.map] ?? null
        /** 이 자리 앞의 회복이 **계약대로** 됐는가. 안 됐으면 관장에게 안 간다 */
        let healOk = need.ok
        if (center !== null && (!need.ok || stop.map === 47)) {
          const got = await api.healAt(center, Math.min(300_000, api.left()))
          healOk = got.ok
          log(`  ${stop.what} 앞 회복 (센터 ${String(center)}) → `
            + `${got.ok ? '나았다' : String(got.why)}`)
          heals.push({ before: stop.map, center, was: need.why, ...got })
        }
        if (hurt) api.trouble.push(`${stop.what} 앞에서 파티가 쓰러져 있었다 (전멸했을 수 있다)`)
        /**
         * ⚠️ **480초로는 모자랐다.** 실측(2026-09-08): 예진호수가 열린 뒤 처음
         * 축복시티까지 갔는데, 거기서 무쇠시티·탄광·체육관 셋이 **전부**
         * 「시간이 다 됐다」로 떨어졌다 — 그런데 그때 전체 예산은 **37분이
         * 남아 있었다.** 막은 것은 게임이 아니라 이 한 줄이었다. 축복시티로
         * 가는 걸음이 900초를 받는 것과 같은 까닭이고(바로 위), 무쇠로 가는
         * 길은 203번도로와 무쇠게이트를 지나므로 그보다 짧지 않다.
         *
         * ⚠️ **전체 예산은 그대로다.** `api.left()`가 늘 함께 걸리므로 이 값을
         * 올려도 한 판이 길어지지 않는다 — 남은 시간을 **쓰는** 것뿐이다
         */
        /**
         * ⚠️ **바깥 길은 뿌리고 들어간다.** 야생과 싸운 시간이 다리를 끊는다
         * (위 `REPEL` 참고). 없으면 그대로 걷는다 — 건너뛰지 않는다
         */
        /**
         * ⚠️ **숲 앞에서 레벨을 맞춘다.** 숲 트레이너는 L11~14를 둘씩 낸다. 실측:
         * 통과한 판(2026-09-16 leg6)은 수풀부기 L19→21이었고, 못 뚫은 판은 둘 다
         * 진화 전 모부기였다 — journey10 L16, journey12(2026-09-17) L17로 숲에서 세 번
         * 전멸해 꽃향기 센터로 밀려났다. 사람도 숲에 들기 전에 이만큼은 올린다.
         *
         * 205번도로 남쪽 풀밭에서 야생과 싸운다. **스프레이를 뿌리기 전이다** — 그
         * 풀밭의 야생(L10~12)은 선두보다 약해서 스프레이가 남아 있으면 안 나온다.
         * 체육관은 여기 안 건다(`JOURNEY_BADGE2` §3.3 — 파티를 꾸려서 넘는다)
         */
        if (stop.id === '19') {
          const got = CANDY
            ? await candyUp(0, null, FOREST_LEVEL)
            : await trainBefore(FOREST_LEVEL, FOREST_GRASS, CENTERS[203],
              Math.min(FOREST_TRAIN_MS, api.left()))
          const trained = CANDY ? candyLine(got) : got
          log(`  ${stop.what} 앞 레벨 맞추기 (선두 L${String(FOREST_LEVEL)}) → ${trained}`)
          story.training = [...(story.training ?? []), { before: stop.what, result: trained }]
          if (CANDY) story.candySteps = [...(story.candySteps ?? []), { what: '숲 앞 선두', ...got }]
        }
        /**
         * ⚠️ **체육관 앞에서 약을 산다** (지시서 §13.5의 3번).
         *
         * 유채는 풀 셋에 좋은상처약 둘을 쓴다. 우리는 한 마리로 붙으므로 약이
         * 없으면 세 번째를 못 넘긴다 — journey13이 첫 도전·재도전 모두 그렇게
         * 졌다. 사람이 체육관 옆 마트에 들르는 그 걸음이고, 파는 것도 원작이
         * 그 시점에 파는 것뿐이다(배지 하나 = 재고 계단 2)
         */
        if (stop.map === 67 && CANDY) {
          const fed = await candyUp(null, STARLY, CANDY_STARLY_LEVEL)
          log(`  ${stop.what} 앞 찌르꼬 사탕 (L${String(CANDY_STARLY_LEVEL)}) → ${candyLine(fed)}`)
          story.training = [...(story.training ?? []),
            { before: `${stop.what} (찌르꼬)`, result: candyLine(fed) }]
          story.candySteps = [...(story.candySteps ?? []), { what: '유채 앞 찌르꼬', ...fed }]
        }
        if (stop.map === 67) {
          potionBuy = await api.buyAt(ETERNA_MART, SUPER_POTION, SUPER_POTIONS,
            Math.min(300_000, api.left()))
          log(`  영원 마트(${String(ETERNA_MART)}) 좋은상처약 ${String(SUPER_POTIONS)}개 → `
            + `${potionBuy.ok ? `${String(potionBuy.bought)}개 샀다 (돈 ${String(potionBuy.money?.[1])}원)`
              : String(potionBuy.why)}`)
          // 켜는 것은 **관장 앞에서**다 (아래 NPC 차례) — 부하 셋에게 다 쓰면
          // 정작 유채 앞에서 빈손이다. 사람도 약은 관장에게 아낀다
        }
        if (REPEL_BEFORE.has(stop.map)) {
          const sprayed = await api.useItem(REPEL, Math.min(150_000, api.left()))
          sprays.push({ before: stop.what, ...sprayed })
          log(`  ${stop.what} 앞 벌레회피스프레이 → `
            + `${sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why)}`)
        }
        /**
         * ⚠️ **다리마다 900초로 자르지 않는다.** 실측(2026-09-16 WebGL 판):
         * 영원시티로 가는 다리가 **355번 나아가던 중에** 그 상한에 끊겼다
         * (「마지막 진행 뒤 0바퀴」 — 멈춘 것이 아니라 걷는 중이었다는 뜻이다).
         * 막은 것은 게임이 아니라 이 한 줄이었다.
         *
         * 그래서 **남은 예산을 남은 자리 수로 나눠** 준다 — 한 다리가 판을
         * 통째로 삼키지는 못하되, 900초보다 길어야 하는 다리는 길게 걷는다.
         * 바닥은 900초다(짧은 다리에서 굳이 줄일 까닭이 없다)
         */
        const ahead = AFTER_STOPS.filter((one) => one.id >= stop.id).length
        /**
         * ⚠️ **위를 안 막으면 한 다리가 판을 통째로 삼킨다.** 900초 상한을
         * 없앤 판(2026-09-16)에서 영원시티 다리가 **30분 동안 줄 하나 없이**
         * 돌았다 — 배틀도 안 붙고 멎지도 않은 채였고, 예산 나누기로는 그 다리
         * 하나가 한 시간까지 쓸 수 있었다. 900초는 너무 짧고(걷는 중에 끊겼다)
         * 한 시간은 너무 길다. **바닥 900초 · 천장 1,800초**로 가둔다
         */
        const room = Math.min(1_800_000,
          Math.max(900_000, Math.floor(api.left() / Math.max(1, ahead))))
        const verdict = await api.goTo(stop.map, Math.min(room, api.left()))
        await api.settle()
        const at = await marks()
        log(`${stop.what}(${String(stop.map)}) → ${verdict} · 지금 맵 ${String(at.map)}`)
        seen.push({ ...stop, verdict, at: at.map ?? null })
        if (verdict === 'arrived') {
          shots.push(await shot(`stop-${stop.id}`))
          /**
           * **정상 진행으로 여기까지 왔다**는 자리를 적어 둔다. 다음 판이
           * `--from`으로 여기서 이어 달릴 수 있다 — 신원이 같을 때만이다.
           *
           * ⚠️ **정상 입력으로 선 판에서만 적는다.** 건너뛰어 온 판에서 다시
           * 적으면 「검증된 자리」가 스스로를 증명하는 꼴이 된다
           */
          if (skipBefore === null) {
            const file = `seg-${stop.id}${CANDY ? '-candy' : ''}.rpsave`
            const kept = await writeReport(file)
            if (kept.ok) {
              const where = await whereNow()
              writeSegment(stop.id, `.audit/journey/${file}`, {
                map: where.world.map, matrix: where.world.matrix,
                x: where.player.x, z: where.player.z,
                poketch: poketch.done, badges: (await readSave()).badges,
              }, SHORTCUTS)
              log(`  구간 ${stop.id}을 적어 뒀다 (${file})`)
            } else log(`  구간 ${stop.id}을 못 적었다 — ${String(kept.why)}`)
          }
          /**
           * ⚠️ **관장은 트레이너 표에 없다.** `trainersOn(47)`이 내는 둘은
           * 체육관 **부하** 둘(스크립트 3243·3244)이고, 관장 로안은
           * `trainerType: 0`인 **사람**이다 — 맵 47의 (5,3), 스크립트 1.
           * 원작도 그렇다: `OreburghGym_Roark`가 스크립트 항목 첫째고, 그 안에서
           * `StartTrainerBattle TRAINER_LEADER_ROARK` → 이기면 `GiveBadge`다
           * (`raw/decomp/…/scripts_oreburgh_city_gym.s`).
           *
           * 그래서 오래 **말을 건 적이 없다.** 부하 둘에게 말을 걸고 배지가
           * 0인 것을 보고 끝났다 (실측). 탄광(198)의 로안도 사람이다 —
           * (19,4) 스크립트 7235
           */
          for (const who of NPC_STOPS[stop.map] ?? []) {
            if (api.left() <= 0) break
            // ⚠️ **회복이 안 된 채로 관장에게 안 간다.** 지면 전멸해서 처음으로
            // 되돌아가고, 그 판은 「배지 0개」만 남긴다 — 왜 0인지가 안 보인다
            if (stop.map === 47 && !healOk) {
              log(`  ${who.what} → 회복이 안 돼서 안 갔다`)
              metNpcs.push({ map: stop.map, ...who, said: false, why: '회복 실패' })
              continue
            }
            /**
             * ⚠️ **한 판마다 시계를 다시 읽는다.** 이길 때마다 바늘이 돌아
             * (`EternaGym_AdvanceClock`) 막힌 칸이 168 → 147 → 135 → 124로
             * 줄어든다 (실측 2026-09-16 `_clock42`). 들어설 때 한 번만 읽으면
             * 둘째 트레이너부터 **열린 길을 못 본다**
             */
            if (stop.map === 67) {
              /**
               * ⚠️ **시계를 먼저 읽고 그다음에 낫는다.** 오래 이 두 줄이 거꾸로
               * 있었다 — 나으러 나가는 길을 **앞 판의 벽**으로 계획했다.
               *
               * 벽은 줄기만 하는 것이 아니다(168→147→135→124). 시침이 돌아서
               * 앞 상태에 열려 있던 칸이 막힌다. 실측(2026-09-17 탐침): 시계 2의
               * 벽으로 낸 길은 (13,13)을 지나는데 시계 3은 그 칸을 막는다 —
               * journey13이 (11,14)·(12,13)에서 90바퀴를 선 그 자리다.
               * 시침을 뛰어넘어야 해서가 아니었다. 뛰지 않아도 **모든 상태에서
               * 문↔부하·관장 왕복 길이 있다**(같은 탐침)
               */
              const walls = await api.eternaWalls()
              if (walls === null) {
                api.trouble.push('꽃시계를 못 읽었다 — 체육관 길을 계획할 수 없다')
              } else gymWalls = new Set(walls)
              await healBetween(who.what)
              /**
               * ⚠️ **약은 관장에게만 쓴다.** 부하 셋 사이에는 영원 센터가 코앞이라
               * 걸어가서 낫는 편이 싸고(`healBetween`), 넷을 부하에게 다 쓰면 정작
               * 유채 앞에서 빈손이다. 사람도 그렇게 아낀다
               */
              if (who.script === LEADER_RETRY[67]?.script && potionBuy?.ok === true) {
                api.usePotions(SUPER_POTION, '좋은상처약', POTION_FLOOR, potionBuy.bought)
              } else api.stopPotions()
              const v = await api.storyVars()
              log(`  ${who.what} 앞 — 시계 ${String(v?.clock ?? '?')}`
                + ` · 이긴 수 ${String(v?.beaten ?? '?')}`
                + ` · 막힌 칸 ${String(walls?.length ?? '?')}`)
            }
            const said = await api.talkToNpc(stop.map, who.script, Math.min(180_000, api.left()))
            await api.settle()
            const badges = (await readSave()).badges
            log(`  ${stop.what} ${who.what} → ${said ? '만났다' : '못 만났다'}`
              + ` · 배지 ${String(badges)}개`)
            const vars = stop.map === 67 ? await api.storyVars() : null
            metNpcs.push({ map: stop.map, ...who, said, badges, vars })
            if (stop.map === 67) clock.push({ who: who.what, said, badges, ...(vars ?? {}) })
          }
          /**
           * **관장에게 한 번은 다시 도전한다.**
           *
           * 지면 원작은 마지막 센터로 되돌려 보낸다 — 사람은 거기서 낫고 다시
           * 온다. 그 한 번을 안 하면 우리 판은 「졌다」가 아니라 「배지가 하나」로만
           * 남고, 진 까닭(파티가 약하다)과 못 간 까닭(길이 없다)이 안 갈린다.
           *
           * ⚠️ **로안에게도 한다.** 오래 유채에게만 있었다. 실측(2026-09-17
           * journey11): 같은 코드로 journey10은 로안을 한 번에 이겼는데 이 판은
           * 부하 둘 뒤에 로안에게 져서 무쇠 센터(48)로 밀려났고, 배지 0개로
           * 북쪽에 올라가 둘째 배지 사슬이 통째로 막혔다. 배틀 운이 가른 것이라
           * 사람이 하듯 낫고 한 번 더 간다.
           *
           * ⚠️ **두 번은 안 한다.** 되돌이가 예산을 통째로 먹는다. 두 번째도
           * 지면 그것은 **파티가 약하다**는 실측이고, 그대로 적힌다
           */
          const leader = LEADER_RETRY[stop.map]
          if (leader !== undefined && (await readSave()).badges < leader.badges
            && api.left() > 600_000) {
            const center = CENTERS[stop.map]
            const again = await api.healAt(center, Math.min(300_000, api.left()))
            log(`  ${leader.what} 재도전 앞 회복 (센터 ${String(center)}) → `
              + `${again.ok ? '나았다' : String(again.why)}`)
            const backIn = await api.goTo(stop.map, Math.min(300_000, api.left()))
            if (backIn === 'arrived' && again.ok) {
              /**
               * ⚠️ **관장만 다시 부르면 안 된다.** 실측(2026-09-17 journey12): 셋째
               * 부하 앤젤라에게 져서 꽃시계가 2에 멈췄는데, 재도전이 유채에게만 말을
               * 걸었다 — 시계가 안 돌아 **관장에게 닿는 길이 없다.** 아직 못 이긴
               * 부하부터 차례대로 다시 간다 (영원 체육관은 이긴 수 = 부하 차례다)
               */
              const beaten = stop.map === 67 ? ((await api.storyVars())?.beaten ?? 0) : 0
              const order = stop.map === 67
                ? (NPC_STOPS[67] ?? []).filter((who, k) => who.script === leader.script || k >= beaten)
                : [{ script: leader.script, what: leader.what }]
              for (const who of order) {
                if (api.left() <= 0) break
                if (stop.map === 67) {
                  // 위와 같은 차례다 — **시계를 먼저 읽는다**
                  const walls = await api.eternaWalls()
                  if (walls !== null) gymWalls = new Set(walls)
                  await healBetween(`${who.what} (재도전)`)
                  // 재도전도 같다 — 남은 약은 관장에게만
                  if (who.script === leader.script && potionBuy?.ok === true) {
                    api.usePotions(SUPER_POTION, '좋은상처약', POTION_FLOOR, potionBuy.bought)
                  } else api.stopPotions()
                }
                const said = await api.talkToNpc(stop.map, who.script, Math.min(300_000, api.left()))
                await api.settle()
                const badges = (await readSave()).badges
                const vars = await api.storyVars()
                log(`  ${who.what} 재도전 → ${said ? '만났다' : '못 만났다'} · 배지 ${String(badges)}개`
                  + (stop.map === 67 ? ` · 시계 ${String(vars?.clock ?? '?')} · 이긴 수 ${String(vars?.beaten ?? '?')}` : ''))
                metNpcs.push({ map: stop.map, script: who.script, what: `${who.what} (재도전)`, said, badges })
                if (stop.map === 67) clock.push({ who: `${who.what} (재도전)`, said, badges, ...(vars ?? {}) })
                // 지면 체육관 밖으로 밀려난다 — 두 번째 되돌이는 안 한다 (위 ⚠️)
                if ((await api.now()).map !== stop.map) break
              }
            } else log(`  ${leader.what} 재도전 → 못 들어갔다 (${backIn})`)
          }
          // 그 자리의 트레이너들 (체육관 부하 둘)
          for (const t of trainersOn(stop.map)) {
            if (api.left() <= 0) break
            const said = await api.talkTo(stop.map, { x: t.x, z: t.z }, Math.min(150_000, api.left()))
            await api.settle()
            const badges = (await readSave()).badges
            log(`  ${stop.what} 트레이너 ${String(t.x)},${String(t.z)} → `
              + `${said ? '반응했다' : '못 걸었다'} · 배지 ${String(badges)}개`)
            if (badges > 0) break
          }
          // 체육관을 나서면 약을 다시 끈다 — 다른 자리에서 쓰면 판마다 가방이 달라진다
          if (stop.map === 67) api.stopPotions()
        }
      }
      return {
        seen, metNpcs, heals, sprays, poketch, north, clock, potionBuy,
        vars: await api.storyVars(), bag: await api.bagState(),
        party: await api.partyState(), badges: (await readSave()).badges,
      }
    },
  }),
    new Promise((r) => {
      hardStop = setTimeout(() => { r({ hardStopped: true }) }, Math.max(60_000, HARD_STOP_MS - (Date.now() - t1)))
    }),
  ])
  if (hardStop !== null) clearTimeout(hardStop)
  if (drive.hardStopped === true) {
    // ⚠️ **없는 시험 번호를 만들지 않는다.** 정본 목록에 없는 줄을 넣으면
    // 봉투가 통째로 거절된다 — 여기서는 던지고, 밖의 `catch`가 ⑨⑨를 FAIL로 적는다.
    // 못 밟은 줄들은 결과에 안 생기므로 **미실행**으로 남는다
    throw new Error(`이야기 구간이 상한 ${String(Math.round(HARD_STOP_MS / 1000))}초를 넘겨 끊었다`)
  }
  Object.assign(story, drive)

  /**
   * ⚠️ **이어 달린 판은 ④~⑦을 안 만든다.** 그 줄들이 재는 것은 이 판이
   * **걸어서 지나온 것**인데, 이어 달린 판은 그 길을 안 걸었다. 0회를 FAIL로
   * 적으면 없는 결함이 생기고, PASS로 적으면 거짓이다 — 그래서 **줄을 안
   * 만든다.** 봉투가 그것을 미실행으로 적는다 (`executedCases`)
   */
  if (!resume.ok) {
    add('04', '파트너를 고르고 라이벌전을 치른다',
      drive.trainer > 0 ? 'PASS' : 'FAIL',
      `트레이너전 ${String(drive.trainer)}회 · 지난 맵 ${String(drive.maps.length)}개`)
    add('05', '야생 배틀이 열린다', drive.wild > 0 ? 'PASS' : 'FAIL', `야생 ${String(drive.wild)}회`)
    add('06', '상점이 열린다', drive.shops > 0 ? 'PASS' : 'FAIL', `상점 ${String(drive.shops)}회`)
    add('07', '202번도로까지 이어진다', drive.maps.includes(343) ? 'PASS' : 'FAIL',
      drive.missed.length === 0 ? '길목을 다 지났다'
        : `못 지난 길목: ${drive.missed.slice(0, 3).join(' · ')}`)
  }

  const seen = drive.extra?.seen ?? []
  const poketch = drive.extra?.poketch ?? null
  /** 첫 배지까지의 자리들. 둘째 배지 쪽은 ⑫ 뒤에 따로 적는다 */
  const FIRST_BADGE_STOPS = new Set(['08', '09', '10', '11'])
  for (const stop of AFTER_STOPS.filter((one) => FIRST_BADGE_STOPS.has(one.id))) {
    const got = seen.find((s) => s.id === stop.id)
    // ⚠️ 축복시티 줄에는 **동쪽이 열렸는지**까지 적는다. 「닿았다」만으로는
    // 그다음 셋이 왜 못 갔는지가 이 표에서 안 보인다 (원작의 포켓치 관문)
    const extra = stop.id === '08' && poketch !== null
      ? ` · 포켓치 ${poketch.done ? '받았다' : `못 받았다 (${String(poketch.why)})`}`
      : ''
    const j = stopVerdict(got?.verdict ?? '안 갔다')
    add(stop.id, `${stop.what}에 걸어서 닿는다`, j.status,
      `${String(got?.verdict ?? '안 갔다')}${got?.at ? ` · 멈춘 맵 ${String(got.at)}` : ''}${extra}`
      + `${j.why === null ? '' : ` · ${j.why}`}`)
  }

  const badges = (await readSave()).badges
  // ⚠️ **왜 못 받았는지가 이 줄에 있어야 한다.** 「배지 0개」만 적으면 관장을
  // 못 만난 것인지, 만나서 진 것인지, 이겼는데 지급이 안 된 것인지를 못 가른다
  const metNpcs = drive.extra?.metNpcs ?? []
  add('12', '첫 배지를 받는다', badges > 0 ? 'PASS' : 'FAIL',
    `배지 ${String(badges)}개`
    + (metNpcs.length === 0 ? ' · 말을 걸 사람 목록이 비었다'
      : ` · ${metNpcs.map((m) => `${String(m.what)} ${m.said ? '만났다' : '못 만났다'}`).join(' · ')}`))
  // 관장을 만난 뒤·전투가 끝난 뒤의 화면이다. 배지를 못 받았으면 그 사실이
  // 이름과 위 줄에 그대로 남는다
  shots.push(await shot('after-gym'))

  // ── ⑰~㉒ 둘째 배지 (지시서 JOURNEY_BADGE2 §2) ────────────────────────────
  //
  // ⚠️ **읽은 값으로 적는다.** 「장면이 돌았다」를 밟기 결말로만 적으면
  // 밟기는 됐는데 장면이 안 돈 판이 통과로 샌다 — 원작의 계약은 변수다
  const north = drive.extra?.north ?? null
  const galactic = north?.vars ?? null
  add('17', '축복시티 북쪽에서 갤럭시단 장면이 돈다',
    galactic?.now === 4 ? 'PASS' : 'FAIL',
    `밟기 ${String(north?.scene ?? '안 갔다')}`
    + ` · 도시단계 ${String(galactic?.was ?? '?')}→${String(galactic?.now ?? '?')}`
    + (north?.bought === null || north?.bought === undefined ? ''
      : ` · 몬스터볼 ${north.bought.ok ? `${String(north.bought.bought)}개 샀다` : String(north.bought.why)}`)
    + ` · 잡은 것 ${String((north?.caught ?? []).filter((c) => c.ok).length)}마리`)

  /**
   * ⚠️ **체육관 도착(21)은 줄을 따로 안 만든다.** 원장 목록(`evidence.JOURNEY_CASES`)의
   * ㉑은 **꽃시계** 줄이다(지시서 §2). 도착까지 줄로 적었더니 한 판에 번호 21이 둘
   * 찍혔다 (2026-09-17 journey12). 도착 결말은 꽃시계 줄에 적는다
   */
  const GYM_STOP = '21'
  for (const stop of AFTER_STOPS.filter((one) => !FIRST_BADGE_STOPS.has(one.id) && one.id !== GYM_STOP)) {
    const got = seen.find((one) => one.id === stop.id)
    const j = stopVerdict(got?.verdict ?? '안 갔다')
    // 숲 줄에는 **동행**까지 적는다 — 붙었는지가 그 구간의 내용이다
    const cheryl = stop.id === '19' && drive.extra?.vars
      ? ` · 동행 상태 ${String(drive.extra.vars.cheryl)}` : ''
    /**
     * ⚠️ **꽃향기 줄에는 험한 샛길까지 적는다.** 그 다리를 막는 것은 거리가
     * 아니라 **바위깨기**다 — 그것을 안 적으면 「닿지 못했다」만 남고 왜인지가
     * 이 표에서 안 보인다
     */
    const cave = stop.id !== '18' || north === null ? ''
      : ` · 바위깨기 ${north.taught?.ok === true ? `${String(north.taught.slot)}번째가 배웠다` : String(north.taught?.why ?? '안 가르쳤다')}`
        + ` · 험한 샛길 ${north.smash?.ok === true ? '길을 열었다' : String(north.smash?.why ?? north.cave ?? '안 갔다')}`
    add(stop.id, `${stop.what}에 걸어서 닿는다`, j.status,
      `${String(got?.verdict ?? '안 갔다')}${got?.at ? ` · 멈춘 맵 ${String(got.at)}` : ''}${cheryl}${cave}`
      + `${j.why === null ? '' : ` · ${j.why}`}`)
  }

  const clock = drive.extra?.clock ?? []
  const clockStates = clock.map((c) => c.clock).filter((one) => one !== undefined && one !== null)
  const beaten = drive.extra?.vars?.beaten ?? null
  const gymArrival = seen.find((one) => one.id === GYM_STOP)?.verdict ?? '안 갔다'
  add('21', '꽃시계가 트레이너 셋마다 열린다', beaten === 3 ? 'PASS' : 'FAIL',
    `체육관 ${String(gymArrival)} · 이긴 수 ${String(beaten ?? '?')}/3 · 시계 ${String(drive.extra?.vars?.clock ?? '?')}`
    + (clock.length === 0 ? ' · 체육관에 못 들어갔다'
      : ` · ${clock.map((c) => `${String(c.who)} ${c.said ? '만났다' : '못 만났다'}`).join(' · ')}`)
    + (clockStates.length === 0 ? '' : ` · 거친 시계 ${clockStates.join('→')}`))

  const badges2 = (await readSave()).badges
  const gym2 = (drive.extra?.metNpcs ?? []).filter((m) => m.map === 67)
  add('22', '둘째 배지를 받는다', badges2 >= 2 ? 'PASS' : 'FAIL',
    `배지 ${String(badges2)}개`
    + ` · 파티 ${JSON.stringify((drive.extra?.party ?? []).map((one) => `${String(one.species)} L${String(one.level)}`))}`
    + (gym2.length === 0 ? ' · 체육관 사람을 아무도 못 만났다'
      : ` · ${gym2.map((m) => `${String(m.what)} ${m.said ? '만났다' : '못 만났다'}`).join(' · ')}`)
    /**
     * ⚠️ **어떻게 넘겼는지를 같은 줄에 적는다** (지시서 §13.5). 배지 수만 적으면
     * 이긴 판과 진 판이 「2개」·「1개」로만 갈리고, **무엇을 바꿔서 이겼는지**가
     * 보고서에서 사라진다 — 기술을 갈아 낀 것인지 약을 쓴 것인지
     */
    + ` · 기술 ${drive.learnTaught?.length > 0 ? drive.learnTaught.join('·') : `안 갈았다(물음 ${String(drive.learnAsks ?? 0)} · 그대로 ${String(drive.learnKept ?? 0)})`}`
    + ` · 좋은상처약 ${String(drive.extra?.potionBuy?.bought ?? 0)}개 사서 ${String(drive.potions?.used ?? 0)}번 썼다`
    + (drive.potions?.why ? ` (${String(drive.potions.why)})` : '')
    /**
     * ⚠️ **지름길 걸음은 여행 결과와 따로 적는다** (지시서
     * JOURNEY21_NEXT_DECISIONS §2). 「이겼다」 옆에 사탕을 몇 알 먹였는지가 아니라,
     * **그 걸음이 돌았는지**를 적어야 이긴 까닭을 사탕 쪽으로 잘못 읽지 않는다
     */
    + (CANDY
      ? ` · 사탕 걸음 ${(story.candySteps ?? []).map((one) =>
        `${String(one.what)} ${one.ran ? `${String(one.fed)}알` : `미실행(${String(one.why)})`}`).join(' · ')}`
      : ''))
  shots.push(await shot('after-gym2'))

  // ── ⑬ 끝 리포트 ──────────────────────────────────────────────────────────
  const endSave = await writeReport('end.rpsave')
  const endState = await readSave()
  add('13', '끝 자리에서 리포트를 쓰고 파일로 받는다', endSave.ok ? 'PASS' : 'FAIL',
    endSave.ok ? `${endSave.file} (${endSave.name}) · ${JSON.stringify(endState)}`
      : String(endSave.why))

  // ── ⑭ 앱을 다시 켜서 이어하기 ────────────────────────────────────────────
  // ⚠️ **기준은 저장한 값이다.** 아래 판정은 이 스냅샷의 `save`와 되켠 뒤의
  // `world`·`player`를 견준다 — DOM의 내림한 칸이 아니다
  const beforeWhere = await whereNow()
  const before = await marks()
  const t2 = Date.now()
  await page.goto(url, { waitUntil: 'load' })
  const cont = page.getByRole('button', { name: '이어하기', exact: true })
  await cont.waitFor({ timeout: 120_000 })
  await cont.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live',
    null, { timeout: 120_000 })
  // ⚠️ **첫 프레임이 나온 것과 그 자리에 선 것은 다르다.** `renderer === 'live'`는
  // 무엇이든 한 장 그렸다는 뜻이고, 그때 세계는 아직 비어 있을 수 있다 —
  // 실측(3판)으로 여기서 곧바로 재서 「맵 undefined 칸 0,0」을 게임의 결함으로
  // 적을 뻔했다. 사람이 보는 것은 **맵이 선 화면**이므로 그때까지 센다.
  // 안 서면 그것은 진짜 결함이고, 아래 판정이 그대로 떨어뜨린다
  const stood = await page.waitForFunction(
    () => (document.documentElement.dataset.map ?? '') !== '', null, { timeout: 60_000 },
  ).then(() => true).catch(() => false)
  timings.warmResumeMs = Date.now() - t2
  await settle()
  /**
   * **저장한 자리에 설 때까지** 기다린다 — 벽시계 상한을 걸고.
   *
   * ⚠️ **`data-map`이 붙은 것과 그 자리에 선 것은 다르다.** 예전 `MapStreamer`는
   * 오버월드 **기본 스폰**(떡잎마을 · 112.5,880.5)으로 한 번 세운 뒤 실내 격자를
   * 비동기로 받아 다시 세웠다. 그 사이에 재면 세이브가 멀쩡해도 「맵 411 칸
   * 112,880」이 나왔다 — 실측으로 그것을 이어하기의 결함으로 적을 뻔했다.
   * 지금은 **목적지에 한 번만 들어선다**(`scene/restoreWorld`) — 그래도
   * 이 기다림은 남긴다: 격자를 받는 동안은 여전히 아무 데도 안 서 있고,
   * 그때 재면 「맵 없음」이 나온다.
   *
   * ⚠️ **못 서면 그대로 떨어진다.** 기다림은 무한이 아니고, 상한에 닿으면
   * 마지막으로 본 자리를 그대로 판정에 넘긴다
   */
  const waitRestored = async (want, capMs = 45_000) => {
    const t0 = Date.now()
    let last = null
    let still = null
    while (Date.now() - t0 < capMs) {
      const m = await marks()
      const w = await whereNow()
      last = w
      /**
       * **복원이 끝났다**는 상태를 못 박는다. 고정 시간을 기다리면 그것은
       * 「대충 이쯤이면 됐겠지」고, 느린 기계에서는 아직 아니고 빠른 기계에서는
       * 낭비다. 여기서 요구하는 것은 넷이다:
       *
       *   ⓪ 제품이 「아직 세우는 중」을 안 적고 있다 (`data-restoring`)
       *   ① 세이브가 가리키는 맵·행렬에 서 있고 격자가 있다
       *   ② 필드다 (`scene === 'overworld'`)
       *   ③ 스크립트도 대사도 안 돈다 — 아직 무언가 옮기는 중이면 자리가 바뀐다
       *   ④ 자리가 **연달아 두 번 같다** — 마지막 한 걸음이 아직 안 끝났을 수 있다
       *
       * ⚠️ **성공을 전제하지 않는다.** ①은 「세이브 맵에 섰는가」라 못 서면
       * 상한까지 기다리다 FAIL이고, 그때 마지막으로 본 자리를 그대로 넘긴다
       */
      const ready = m.restoring === undefined
        && w.world.map === want.map && w.world.matrix === want.matrix
        && w.world.grid && m.scene === 'overworld'
        && m.script === undefined && m.talk === undefined
      const here = `${String(w.player.x)},${String(w.player.z)}`
      if (ready && still === here) return { ok: true, ms: Date.now() - t0, at: w }
      still = ready ? here : null
      await page.waitForTimeout(250)
    }
    return { ok: false, ms: Date.now() - t0, at: last }
  }
  const restored = await waitRestored(beforeWhere.save)
  timings.restoreMs = restored.ms
  const back = await marks()
  const backWhere = restored.at
  shots.push(await shot('resumed'))
  /**
   * ⚠️ **맵 번호만 보면 안 된다.** 예전 판은 `back.map === before.map` 하나였고,
   * 그러면 **같은 맵의 엉뚱한 자리**가 그대로 통과한다. 지금은 저장한 값과
   * 견준다 — 맵·행렬·좌표·방향, 그리고 월드가 실제로 섰는가까지.
   *
   * 좌표는 **딱 맞아야 한다.** 복원은 세이브의 x·z를 그대로
   * `enter(next, at.map, at.x, at.z, at.matrix)`에 넣는다 — 보정이 없다.
   * 실측(침실 415/129와 무쇠 414/128, 두 판)에서 어긋남이 **0.00**이었다.
   *
   * ⚠️ **`walkOutOfDoor`의 한 칸 보정을 여기 끌어오지 않는다.** 그것은 **문으로
   * 들어설 때** 통행 불가 타일에서 한 칸 내려 세우는 것이고 워프 경로의 일이다.
   * 그걸 핑계로 허용 범위를 반 칸으로 넓히면 **같은 맵의 옆 칸**이 통과한다.
   * 여기 `EPS`는 실수 왕복에서 생길 수 있는 오차만 본다.
   *
   * 높이(y)는 안 본다 — 격자가 다시 내주는 값이라 자료가 바뀌면 따라간다
   * (`MapStreamer`가 그 까닭을 적는다). 방향은 라디안이고 0.01(약 0.6도)이다
   */
  const EPS = 0.01
  const FACE_TOL = 0.01
  const want = beforeWhere.save
  // 한 번도 못 읽었으면 **없는 자리**로 둔다 — 판정이 조용히 통과하면 안 된다
  const got = backWhere ?? {
    world: { map: -1, matrix: -1, grid: false },
    player: { x: NaN, z: NaN, facing: NaN },
  }
  const gap = {
    x: Math.abs(got.player.x - want.x), z: Math.abs(got.player.z - want.z),
    facing: Math.abs(Math.atan2(Math.sin(got.player.facing - want.facing),
      Math.cos(got.player.facing - want.facing))),
  }
  const sameMap = got.world.map === want.map && got.world.matrix === want.matrix
  const samePlace = gap.x <= EPS && gap.z <= EPS
  const sameFacing = gap.facing <= FACE_TOL
  const ready = stood && got.world.grid && restored.ok
  const at = (w) => `${String(w.map ?? w.world?.map)}/${String(w.matrix ?? w.world?.matrix)}`
  add('14', '앱을 다시 켜면 이어하기로 **저장한 그 자리**에 선다',
    ready && sameMap && samePlace && sameFacing ? 'PASS' : 'FAIL',
    `${String(Math.round(timings.warmResumeMs / 1000))}초 · 저장한 자리 ${at(want)}`
    + ` ${want.x.toFixed(2)},${want.z.toFixed(2)}`
    + ` → 돌아온 자리 ${at(got)} ${got.player.x.toFixed(2)},${got.player.z.toFixed(2)}`
    + ` · 어긋남 x${gap.x.toFixed(2)} z${gap.z.toFixed(2)} 방향${gap.facing.toFixed(2)}`
    + ` · 복원 ${String(Math.round(restored.ms / 100) / 10)}초`
    + (restored.ok ? '' : ` · **${String(Math.round(restored.ms / 1000))}초를 기다려도 저장한 맵에 안 섰다**`)
    + (stood ? '' : ' · 60초를 기다려도 맵이 안 섰다')
    + (sameMap ? '' : ' · **다른 맵이다**')
    + (samePlace ? '' : ' · **같은 맵이라도 다른 자리다**')
    + (sameFacing ? '' : ' · 방향이 다르다')
    + ` · DOM 칸 ${String(before.tile)} → ${String(back.tile)}`)

  // ⚠️ **3D가 진짜 그려졌는가.** 계기판을 숨기고 **캔버스만** 잰다 — 화면
  // 전체로 재면 DOM이 문턱을 혼자 넘긴다 (위 `shot`이 왜인지를 적는다).
  //
  // ⚠️ **필요한 자리 목록은 판정 밖에서 온다.** 안에서 「찍은 것만」 세면 한
  // 컷만 찍고도 통과한다. 그리고 그 자리에 **못 간 것**은 앞 줄이 이미
  // 떨어뜨렸으므로 여기서는 FAIL이 아니라 BLOCKED다 — 한 사슬의 실패를
  // 여러 결함처럼 세지 않는다
  // ⚠️ **영원 체육관 한 컷이 늘었다.** 꽃시계 방은 이 구간에서 처음 그려지는
  // 실내이고, 바늘이 도는 자리라 정지 화면으로도 볼 것이 있다
  const WORLD_NEED = ['bedroom', 'after-gym', 'after-gym2', 'resumed']
  const short = missingShots(WORLD_NEED, shots.map((one) => one.name))
  const world = shots.filter((one) => one.canvas !== undefined)
  /**
   * ⚠️ **준비와 화면을 가른다** (지시 §3).
   *
   * 「지형이 설 때까지」 기다리다 상한을 넘은 컷은 **판정 불가**다 — 그 컷의
   * 그림이 무엇이든 「제품이 못 그린다」의 증거가 못 된다. 반대로 **준비가
   * 됐다고 선언한 뒤**에 그림이 틀렸으면 그건 덜 기다린 것이 아니라
   * **화면 결함**이다.
   *
   * ⚠️ **준비 실패도 결과다.** 사용자는 그 시간 동안 실제로 빈 화면을 봤다 —
   * 「기다렸더니 됐다」로 접지 않는다
   */
  /**
   * ⚠️ **못 잰 것과 안 된 것을 가른다** (후속 §7). `probeFailed`는 재는 자가
   * 한 번 묻는 데 상한을 넘긴 것이라 **화면의 상태가 아니다** — 그것으로 제품을
   * FAIL로 적으면 없는 결함을 쫓게 되고, PASS로 적으면 검사가 사라진다.
   * 그래서 BLOCKED다
   */
  const probeBroke = world.filter((one) => one.readiness?.probeFailed === true)
  const notReady = world.filter(
    (one) => one.readiness?.ok === false && one.readiness.probeFailed !== true)
  const judged = world.filter((one) => one.readiness?.ok !== false)
  const blank = judged.filter((one) => !one.canvas.drawn)
  const shook = judged.filter((one) => !one.canvas.steady)
  /** 실패한 그 실행에서 30초를 더 봤을 때 끝내 안 채워진 컷 */
  const stuck = blank.filter((one) => (one.after ?? []).every((r) => r.drawn !== true))
  const bad = notReady.length > 0 || blank.length > 0 || shook.length > 0
  add('15', '3D 화면이 실제로 그려져 있다 (캔버스만 떼어 지형 칸으로 잰다)',
    short.length > 0 || (probeBroke.length > 0 && !bad) ? 'BLOCKED' : bad ? 'FAIL' : 'PASS',
    short.length > 0
      ? `${short.join(' · ')} 자리까지 못 갔다 — 앞 줄을 본다`
      : probeBroke.length > 0 && !bad
        ? `재는 자가 ${String(probeBroke.length)}컷에서 못 물었다 (관측 실패, 화면 상태 아님) — `
          + probeBroke.map((one) => `${one.name}: ${String(one.readiness.why)}`).join(' · ')
      : !bad
        ? world.map((one) => `${one.name} 지형칸 ${String(one.canvas.filled)}`
          + `/${String(one.canvas.roi)} · ${String(one.readiness.waitedMs)}ms 기다렸다`).join(' · ')
        : [
          notReady.length === 0 ? null
            : `준비 실패 ${String(notReady.length)}컷 (판정 불가) — `
              + notReady.map((one) => `${one.name}: ${String(one.readiness.why)}`
                + ` (${String(one.readiness.waitedMs)}ms)`).join(' · '),
          blank.length === 0 ? null
            : `준비됐다는데 지형이 없다 ${String(blank.length)}/${String(judged.length)}컷 — `
              + blank.map((one) => `${one.name} (지형칸 ${String(one.canvas.filled)}`
                + `/${String(one.canvas.roi)} · 검은칸 ${String(one.canvas.voids)}`
                + ` · 색 ${String(one.canvas.colors)}`
                + ` · 옛 잣대로는 ${one.canvas.flatOnly ? '통과' : '실패'})`).join(' · '),
          stuck.length === 0 ? null
            : `그 실행에서 30초를 더 봐도 안 채워진 컷 ${String(stuck.length)}개`
              + ` — 늦게 그리는 것이 아니다`,
          shook.length === 0 ? null : `찍는 동안 흔들린 컷 ${String(shook.length)}개`,
        ].filter((l) => l !== null).join(' ｜ '))

  const errors = noise.filter((one) => one.kind !== 'warning')
  /**
   * `performance.measure`가 터진 것을 감시자가 잡았으면 **어느 부품의 어느 prop**인지를
   * 여기 적는다 — 「오류 1건」만으로는 고칠 자리가 없다
   */
  perfSpy = await page.evaluate(() => window.__perfSpy ?? null).catch(() => null)
  const blame = (perfSpy?.fails ?? []).slice(0, 3).map((f) => `<${f.name}>`
    + (f.culprit?.[0] ? ` ${String(f.culprit[0].path)}(${String(f.culprit[0].kind)})` : '')
    + (Array.isArray(f.props) ? ` prop ${f.props.map((r) => (Array.isArray(r) ? r[0] : r)).slice(0, 4).join(',')}` : ''))
  add('16', '콘솔이 조용하다', noise.length === 0 ? 'PASS' : 'FAIL',
    noise.length === 0 ? `오류·경고 0건 (measure ${String(perfSpy?.calls ?? 0)}회 · 터진 것 0)`
      : `오류 ${String(errors.length)} · 경고 ${String(noise.length - errors.length)} — `
        + [...new Set(noise.map((one) => one.text.slice(0, 110)))].slice(0, 3).join(' | ')
        + (blame.length === 0 ? '' : ` ｜ 복제를 막은 것: ${blame.join(' · ')}`))

  ranToTheEnd = true
  add('99', '검사가 끝까지 갔다', 'PASS', `${String(rows.length)}줄 · 그림 ${String(shots.length)}컷`)
} catch (e) {
  if (!ranToTheEnd) {
    // ⚠️ **게임을 못 연 것은 게임의 실패가 아니다** (지시서 H3). BLOCKED는
    // 통과가 아니므로 이 판은 조용한 기계에서 **다시 돌아야** 한다
    const why = String(e.message ?? e)
    add('99', '검사가 끝까지 갔다', why.startsWith(INFRA) ? 'BLOCKED' : 'FAIL', why.slice(0, 400))
  }
} finally {
  // ⚠️ **화면을 닫기 전에 걷는다** — 닫은 뒤에는 마지막 몫을 못 읽는다
  load = await loadSpy.stop().catch(() => null)
  // 파일은 맥락이 닫힐 때 쓰인다 — 경로는 그 뒤에야 확실해진다
  const clip = page.video()
  await browser.close()
  if (clip !== null) {
    try {
      video = `shots/journey/video/${(await clip.path()).split(/[\/]/).pop()}`
      console.log(`  영상 ${video}`)
    } catch { video = null }
  }
}

console.log('\n대표 구간 — 새 게임에서 첫 배지까지 (기획서 §7 · G-B)\n')
const counts = ['PASS', 'FAIL', 'BLOCKED']
  .map((s) => `${s} ${String(rows.filter((r) => r.status === s).length)}`).join(' · ')
console.log(`  ${counts}`)
console.log(`  그림 ${SHOTS}`)

mkdirSync(resolve(ROOT, '.audit'), { recursive: true })
// ⚠️ **`executedCases`를 결과 줄에서 뽑지 않는다.** 도중에 터져 여덟 줄만 남은
// 파일과 열일곱 줄을 다 돌린 파일이 똑같아 보이면 안 된다 — 실제로 밟은 목록을
// 여기서 넘기고, 판정은 `validateEvidence`가 정본과 맞대어 한다
writeFileSync(resolve(ROOT, '.audit/journey.json'), `${JSON.stringify(sealEvidence({
  dataAtStart,
  suite: 'journey',
  expectedCases: EXPECTED_CASES,
  executedCases: rows.map((r) => r.id),
  startDigest: START_DIGEST,
  shortcuts: SHORTCUTS,
  environment: {
    ...describeEnvironment({ browserVersion, gpu, backend }),
    view: VIEW,
    // ⚠️ **이 판이 얼마나 붐볐는지가 봉투 안에 있어야 한다** (지시서 H4).
    // 밖에 적으면 다음 사람이 「그때 기계가 어땠는지」를 못 되짚는다
    load,
  },
  results: rows,
  extra: { timings, story, shots, video, noise, perfSpy },
}), null, 1)}\n`)

process.exit(rows.some((r) => r.status === 'FAIL' || r.status === 'BLOCKED') ? 1 : 0)
