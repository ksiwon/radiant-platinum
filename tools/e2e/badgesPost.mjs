// 전당등록 뒤 (P6 — `docs/orders/JOURNEY_PARTS_20261008.md` §6 · 칸 17~) — 사용자가 고른 차례(10-08) 그대로 다리 하나가 칸 하나다.
//
//   n 전국도감(마박사) · o 배틀존(파이트에리어 → 서바이벌에리어 → 리조트에리어) · p 배틀 팩토리 한 판 · q 하드마운틴과 히드런
//   r 사천왕 재대결 · s 선단신전과 레지기가스 · t 로토무
//
// ⚠️ **측정 규칙은 앞 다리들과 같다** — 방향키/A/B와 화면 단추만, `vars`·`flags`·`bag`은 읽기만, 사탕은 가방에 넣는 것만
// 개발 모듈이고 먹이는 것은 화면이다(`journey-levels-by-candy`). 그 밖의 지름길은 **기본 꺼짐 깃발**(`--shortcut=…`)
// 뒤에만 있고 켜면 봉투 `scope.shortcuts`에 적힌다(`gate-shortcuts-dont-refuse`). 깃발 없이 돌면 그 자리에서 「못 간다」를
// 까닭과 함께 적고 멈춘다 — 통과로 접지 않는다
import { boardWarp } from './badges.mjs'
import { MAP as LEAGUE_MAP, eliteFour, victoryRoad } from './badgesLeague.mjs'
import { snowpointSlide, sprayBest, teachTo } from './badges67.mjs'
import { gridOf, matrixOf, npcsOf, warpsOf, waterAt } from './route.mjs'
import { solvePush } from './pushSolve.mjs'

/** 맵 번호 (`generated/map_headers.txt` 줄 − 1) */
export const MAP = {
  ...LEAGUE_MAP,
  twinleafHouse1F: 414, twinleafHouse2F: 415,
}

/** 도구 번호 (`generated/items.txt` 줄 − 1) — 431 `ITEM_POKE_RADAR` (줄 432) */
export const ITEM = { pokeRadar: 431 }

/**
 * **지름길 깃발** — 이 다리들이 아는 것 전부. 켠 것만 `ctx.shortcuts`로 들어온다(journey `--shortcut=a,b`).
 *
 * · `dex-seen`: 신오도감 210종을 「봤다」로 적는다(개발 모듈 `markSeen`). 원작에서 전국도감은 마박사에게 **신오 210종을 다 본 뒤**
 *   말을 걸어야 받는다 — `scripts_sandgem_town_pokemon_research_lab.s` `SandgemTownLab_ProfRowanReactToPokedex`:
 *   `CheckLocalDexCompleted` 참일 때만 `SandgemTownLab_ShowCompleteLocalDex` → `EnableNationalDex`. 제품도 「본 것」으로 센다
 *   (`fieldServices.trainerInfo.dexCompleted(false)` — `pokedexSort.*.json`의 `lists.sinnoh` 210종 전부 `seen`). 210종을 걸어서
 *   보는 판은 하네스가 아니라 도감 채우기라 이 깃발 뒤에 둔다
 */
export const SHORTCUT_NAMES = ['dex-seen', 'diag-first-arrival', 'regi-trio', 'night']
/**
 * · `regi-trio`: 레지락 · 레지아이스 · 레지스틸(L30 · 유적과 같은 레벨)을 파티에 넣는다. 자리가 모자라면 기라티나(487)를 상자로 보낸다.
 *   원작에서 선단신전 레지기가스는 파티에 셋이 다 있어야 깨어난다(`HasAllLegendaryTitansInParty` · `src/unk_0205DFC4.c:229`). 그런데
 *   셋이 사는 유적은 **운명적 만남 레지기가스**(배포)를 데려가야 열린다(`scripts_rock_peak_ruins.s:31` 등 · `src/scrcmd.c:7113`) —
 *   신전 레지기가스는 운명적 만남이 아니라 고리가 닫혀 있다. 게임 안에서 셋을 얻는 길은 배포 아니면 팔파크(3세대 옮기기 · 통신 범위 밖)뿐이다
 * · `night`: 게임 시각을 21시로 맞춘다(`worldState.time.gameHour` — 원작은 본체 시계를 읽는다). 고성 로토무는 밤(20~03시)에만
 *   TV에서 나온다(`scripts_old_chateau_*` · `rtc.c` 시간대 표). 판이 낮에 돌면 사람은 본체 시계를 밤으로 맞추거나 밤까지 기다린다
 */
/**
 * · `diag-first-arrival` (**진단** — 이것을 켠 판은 통과가 아니다): 날기 자리로 켜진 마을의 「첫 도착」 깃발
 *   (`FLAG_FIRST_ARRIVAL_*` = 2480 + 스폰 표 `firstArrival`)을 세운다. **제품 결함 후보** — 원작은 마을에 발을 들이면
 *   `spawn_locations.c:135` `SystemFlag_HandleFirstArrivalToZone(HANDLE_FLAG_SET, firstArrival)`로 이 깃발을 세우는데,
 *   제품 `scene/pokecenter.ts` `arriveAt`은 따로 둔 비트(`flySpots`)만 켜고 깃발은 안 세운다. 실측(2026-10-16 · 칸 16 끝 세이브):
 *   영원시티를 지나 배지 8까지 갔는데 2490 `FLAG_FIRST_ARRIVAL_ETERNA_CITY`가 거짓 → 마박사가 `GoToIfUnset FLAG_FIRST_ARRIVAL_ETERNA_CITY`
 *   (`scripts_sandgem_town_pokemon_research_lab.s:54`)로 도감 평가(공용 0x26DE)만 하고 끝나 전국도감을 영영 못 받는다
 *   (대사 0·1·5 → `ReturnCommonScript` → `End`). 그 뒤 칸을 진단하려고 둔다
 */

const noteOf = (out, ctx) => (what, detail) => {
  out.steps.push({ what, detail })
  ctx.log(`  ${what} → ${detail}`)
}

/**
 * **장면이 끝나 값이 바뀔 때까지 대사를 넘기며 기다린다** (`badgesLeague.sceneUntil`과 같다 — 들어선 순간에는 장면이 아직 안 열렸을 수 있다)
 */
async function until(api, ok, ms = 30_000) {
  let got = null
  for (const till = Date.now() + ms; ;) {
    await api.clearTalk(); await api.settle()
    got = await ok()
    if (got === true || Date.now() >= till) return got
    await new Promise((r) => { setTimeout(r, 1000) })
  }
}

/** 도감 · 전국도감 · 레이더 — 읽기만 (`useSaveStore` · `fieldServices`가 세는 그 목록) */
export const dexState = (page) => page.evaluate(async () => {
  const save = (await import('/src/state/saveStore.ts')).useSaveStore.getState()
  const gd = await import('/src/data/gameData.ts')
  const { dexHas } = await import('/src/engine/pokemon/dex.ts')
  const sinnoh = (await gd.loadPokedexSort('ko')).lists.sinnoh ?? []
  return {
    national: save.nationalDex === true,
    sinnoh: sinnoh.length,
    seen: sinnoh.filter((n) => dexHas(save.pokedex.seen, n)).length,
    caught: sinnoh.filter((n) => dexHas(save.pokedex.caught, n)).length,
    missing: sinnoh.filter((n) => !dexHas(save.pokedex.seen, n)),
    // 게임이 스크립트에 답하는 그 값 — `CheckLocalDexCompleted` · `GetLocalDexSeenCount` · 2490 `FLAG_FIRST_ARRIVAL_ETERNA_CITY`
    game: await (async () => {
      const f = await import('/src/engine/script/field.ts')
      const ti = f.fieldScripts.services?.trainerInfo
      return ti === undefined ? null : {
        completed: ti.dexCompleted(false), count: ti.dexCount(false, false), eterna: f.fieldScripts.vars.checkFlag(2490),
      }
    })().catch((e) => String(e?.message ?? e).slice(0, 120)),
  }
}).catch((e) => ({ why: String(e?.message ?? e).slice(0, 200) }))

/**
 * **대사 기록** — 말을 건 뒤 화면에 뜬 글을 차례로 모은다(읽기만 · 화면 글 `innerText`). 장면이 기대와 다르게 갈릴 때
 * 어느 갈래로 갔는지를 롬 대사와 맞대는 근거다. `start`가 기록을 켜고 `take`가 모은 것을 내고 끈다
 */
export const talkLog = {
  // 제품이 내놓은 관측 손잡이(`engine/script/spy.ts`의 `scriptSpy.message`)에 대사 번호와 글을 받는다 — 게임 상태는 안 바꾼다
  start: (page) => page.evaluate(async () => {
    const { scriptSpy } = await import('/src/engine/script/spy.ts')
    const w = /** @type {any} */ (window)
    w.__p6talk = []
    if (w.__p6prev === undefined) w.__p6prev = scriptSpy.message ?? null
    scriptSpy.message = (id, text, n) => {
      w.__p6talk.push(`${String(id)}:${String(text).replace(/\s+/g, ' ').slice(0, 120)}`)
      w.__p6prev?.(id, text, n)
    }
    if (w.__p6prevSkip === undefined) w.__p6prevSkip = scriptSpy.unimplemented ?? null
    scriptSpy.unimplemented = (name, file, at) => { w.__p6talk.push(`!미구현 ${String(name)}@${String(file)}`); w.__p6prevSkip?.(name, file, at) }
    // 판 끝 · 오류 · 마지막 명령 — 장면이 대사 없이 선 자리를 가린다
    for (const k of ['end', 'error', 'opcode']) {
      if (w[`__p6prev_${k}`] === undefined) w[`__p6prev_${k}`] = scriptSpy[k] ?? null
    }
    scriptSpy.end = (kind) => { if (kind !== 'init') w.__p6talk.push('!판 끝'); w.__p6prev_end?.(kind) }
    scriptSpy.error = (msg, where) => { w.__p6talk.push(`!오류 ${String(msg).slice(0, 160)} @ ${String(where).slice(0, 80)}`); w.__p6prev_error?.(msg, where) }
    w.__p6op = []
    scriptSpy.opcode = (op, file, at) => { w.__p6op.push([op, file, at]); if (w.__p6op.length > 12) w.__p6op.shift(); w.__p6prev_opcode?.(op, file, at) }
  }).catch(() => {}),
  take: (page) => page.evaluate(async () => {
    const { scriptSpy } = await import('/src/engine/script/spy.ts')
    const w = /** @type {any} */ (window)
    scriptSpy.message = w.__p6prev ?? undefined
    scriptSpy.unimplemented = w.__p6prevSkip ?? undefined
    for (const k of ['end', 'error', 'opcode']) { scriptSpy[k] = w[`__p6prev_${k}`] ?? undefined; w[`__p6prev_${k}`] = undefined }
    w.__p6prev = undefined
    w.__p6prevSkip = undefined
    const { COMMANDS } = await import('/src/import/platinum/scriptMeta.ts')
    const ops = (w.__p6op ?? []).map(([op, file, at]) => `${COMMANDS[op]?.name ?? op}@${String(file)}:${String(at)}`)
    const running = document.documentElement.dataset.script === '1'
    return [...(w.__p6talk ?? []), `!마지막 명령 ${ops.join(' ')}`, `!스크립트 ${running ? '도는 중' : '없음'}`]
  }).catch(() => []),
}

/** 가방에 그 도구가 있나 — `bagState`가 내는 그 목록 (읽기만) */
const have = async (api, item) => ((await api.bagState())?.items ?? []).some((one) => one.item === item && one.count > 0)

// ── n 전국도감 ─────────────────────────────────────────────────────────────

/** 연구소의 마박사 — 보통 (7,5)(events 422 localID 0 · 스크립트 3). 연구소 상태 2·3이면 들어설 때 (7,14)로 옮긴다(`SandgemTownLab_SetProfRowanAndCounterpartPositions`) — 그래서 자리를 박지 않고 지금 자리를 읽어 따라간다 (실측 칸 16 끝: 상태 4 · (7,5)) */
const LAB_ROWAN_SCRIPT = 3

/**
 * **다리 n — 전국도감을 받는다.** 떡잎마을 침실(이어하기 자리)에서 모래시티 연구소로 가 마박사에게 말을 건다.
 * 신오 210종을 다 봤으면 「보여 주러 왔나?」 예 → 오박사가 들어와 도감을 올린다 → 포켓트레(레이더)를 준다.
 * 도착 판정: `nationalDex` 참 · 가방에 포켓트레
 */
export async function nationalDex(api, ctx, page) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }

  let dex = await dexState(page)
  note('도감 처음', JSON.stringify({ ...dex, missing: dex.missing?.length }))
  if (dex.national !== true) {
    if (dex.seen !== dex.sinnoh || dex.sinnoh !== 210) {
      if (!ctx.shortcuts.includes('dex-seen')) {
        out.blocked = `신오도감 ${String(dex.seen)}/${String(dex.sinnoh)} — 원작은 210종을 다 봐야 마박사가 전국도감을 준다`
          + ' (scripts_sandgem_town_pokemon_research_lab.s CheckLocalDexCompleted). 걸어서 210종을 보는 판이 아니다 — --shortcut=dex-seen'
        note('전국도감 조건', out.blocked)
        return done()
      }
      // 지름길 — 못 본 종만 「봤다」로 적는다(잡은 것은 안 건드린다). 몇 종을 적었는지 봉투에 남긴다
      const marked = await page.evaluate(async (list) => {
        const save = (await import('/src/state/saveStore.ts')).useSaveStore
        for (const n of list) save.getState().markSeen(n)
        return list.length
      }, dex.missing)
      out.shortcut = { name: 'dex-seen', marked, species: dex.missing }
      dex = await dexState(page)
      note('지름길 dex-seen', `못 본 ${String(marked)}종을 봤다로 적었다 → ${String(dex.seen)}/${String(dex.sinnoh)}`)
    }
    const eterna = (await dexState(page)).game?.eterna
    if (eterna !== true) {
      if (!ctx.shortcuts.includes('diag-first-arrival')) {
        out.blocked = '제품 결함 후보 — 2490 FLAG_FIRST_ARRIVAL_ETERNA_CITY가 안 섰다(arriveAt이 flySpots만 켠다). 마박사가'
          + ' scripts_sandgem_town_pokemon_research_lab.s:54에서 평가만 하고 끝난다 — 진단은 --shortcut=diag-first-arrival'
        note('첫 도착 깃발', out.blocked)
        return done()
      }
      const set = await page.evaluate(async () => {
        const f = await import('/src/engine/script/field.ts')
        const { spawnTable } = await import('/src/engine/map/spawns.ts')
        const save = (await import('/src/state/saveStore.ts')).useSaveStore
        const lit = save.getState().flySpots
        const flags = []
        spawnTable.list.forEach((spot, i) => {
          if ((lit & (1 << i)) === 0) return
          const flag = 2480 + spot.firstArrival
          if (!f.fieldScripts.vars.checkFlag(flag)) { f.fieldScripts.vars.setFlag(flag); flags.push(flag) }
        })
        save.getState().commitScriptState(f.fieldScripts.vars.saved, f.fieldScripts.vars.flags)
        return flags
      })
      out.diagFirstArrival = set
      note('진단 diag-first-arrival', `날기 자리로 켜진 마을의 첫 도착 깃발 ${JSON.stringify(set)}을 세웠다 → 2490 ${String((await dexState(page)).game?.eterna)}`)
    }
    const fly = await api.flyTo(MAP.sandgem, Math.min(180_000, api.left()))
    note('공중날기 → 모래시티', fly.ok ? '닿았다' : String(fly.why))
    const lab = await api.goTo(MAP.sandgemLab, Math.min(600_000, api.left()))
    note('연구소(422)', lab)
    // 들어설 때의 자리 옮김(OnTransition)을 믿지 말고 지금 자리를 읽어 따라간다 — 스크립트 3이 마박사다(events 422 localID 0)
    const spots = await api.npcSpots(MAP.sandgemLab)
    const rowan = await api.npcSpot(MAP.sandgemLab, LAB_ROWAN_SCRIPT)
    note('연구소 사람', `${JSON.stringify(spots)} · 마박사 ${JSON.stringify(rowan)} · 연구소 상태 ${String((await api.storyVars())?.sandgemLab)}`)
    await talkLog.start(page)
    const said = await api.talkToNpc(MAP.sandgemLab, LAB_ROWAN_SCRIPT, Math.min(300_000, api.left()))
    const got = await until(api, async () => (await dexState(page)).national === true && await have(api, ITEM.pokeRadar), 120_000)
    dex = await dexState(page)
    out.talk = await talkLog.take(page)
    note('마박사 대사', JSON.stringify(out.talk))
    note('마박사', `${said ? '말 걸었다' : '못 걸었다'} · 전국도감 ${String(dex.national)} · 포켓트레 ${String(await have(api, ITEM.pokeRadar))} · ${String(got)}`)
  }
  out.national = dex.national === true
  out.radar = await have(api, ITEM.pokeRadar)
  out.ok = out.national && out.radar
  return done()
}

export const reachedNationalDex = async (api, page) => (await dexState(page)).national === true && await have(api, ITEM.pokeRadar)

export { boardWarp }

// ── 공용 읽기 ─────────────────────────────────────────────────────────────

/** 변수 · 깃발을 번호로 읽는다 (읽기만 — `fieldScripts.vars`). 번호는 `vars_flags.txt`를 C 열거형으로 센 값(`_pg42.design.md`와 같은 셈) */
export const varsFlags = (page, vars = [], flags = []) => page.evaluate(async ([vs, fs]) => {
  const v = (await import('/src/engine/script/field.ts')).fieldScripts.vars
  return { ...Object.fromEntries(vs.map((id) => [`v${String(id)}`, v.get(id)])), ...Object.fromEntries(fs.map((id) => [`f${String(id)}`, v.checkFlag(id) === true])) }
}, [vars, flags]).catch(() => null)

/** 맵이 `ok`를 만족할 때까지 대사를 넘기며 기다린다 — 배 · 스크립트 워프가 격자를 받는 동안 */
async function untilMapTalking(api, ok, ms) {
  for (const till = Date.now() + ms; Date.now() < till;) {
    if (ok((await api.now()).map)) return true
    await api.clearTalk(); await api.settle()
    await new Promise((r) => { setTimeout(r, 500) })
  }
  return ok((await api.now()).map)
}

// ── o 배틀존 ───────────────────────────────────────────────────────────────

/**
 * 배틀존 맵 (`map_headers.txt` 줄 − 1 · 이음은 `events.json` 워프로 맞대었다): 선단시티 165 · 선단 센터 168 · 파이트에리어 188 ·
 * 225번도로 게이트 193 · 225번도로 400 · 서바이벌에리어 450 · 226번수로 469 · 228번도로 게이트 501 · 228번도로 406 · 229번도로 407 ·
 * 리조트에리어 457
 */
export const ZONE = {
  snowpoint: 165, snowpointCenter: 168, fight: 188, gate225: 193, route225: 400, survival: 450,
  route226: 469, gate228: 501, route228: 406, route229: 407, resort: 457,
}
/** 선단시티 배 선원 — localID 8 (356,247) 스크립트 12. `FLAG_GAME_COMPLETED`만 본다 (`scripts_snowpoint_city.s:183`) */
const SNOWPOINT_SAILOR_SCRIPT = 12
/** 파이트에리어 라이벌 — localID 7 스크립트 14. 「같이 싸우자」에 아니오였으면 (655,426)에 서서 다시 묻는다 */
const FIGHT_RIVAL_SCRIPT = 14
/** 16513 `VAR_FIGHT_AREA_STATE` 0 → 장면 1 → 태그 배틀 뒤 2 · 깃발 660 `FLAG_HIDE_FIGHT_AREA_BLOCKADE`(225번도로 앞 둘) · 343 배를 탔다 */
const FIGHT_STATE = 16513
const FIGHT_BLOCKADE = 660
const SAILED = 343

/**
 * **다리 o — 배틀존에 든다.** 선단시티 배 → 파이트에리어(라이벌과 짝이 되어 전진 · 대엽과 태그 배틀) → 225번도로 →
 * 서바이벌에리어 → (파이트에리어로 날아) 230번수로 → 229번도로 → 리조트에리어. 도착 판정: 리조트에리어(457) · 16513 ≥ 2
 */
export async function battleZone(api, ctx, page) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const read = () => varsFlags(page, [FIGHT_STATE], [FIGHT_BLOCKADE, SAILED])
  let v = await read()
  note('처음', JSON.stringify(v))

  if ((v?.[`v${String(FIGHT_STATE)}`] ?? 0) === 0 && (await api.now()).map !== ZONE.fight) {
    const fly = await api.flyTo(ZONE.snowpoint, Math.min(180_000, api.left()))
    note('공중날기 → 선단시티', fly.ok ? '닿았다' : String(fly.why))
    const heal = await api.healAt(ZONE.snowpointCenter, Math.min(300_000, api.left()))
    note('선단 센터 회복', heal.ok ? '나았다' : String(heal.why))
    await talkLog.start(page)
    const said = await api.talkToNpc(ZONE.snowpoint, SNOWPOINT_SAILOR_SCRIPT, Math.min(300_000, api.left()))
    const sailed = await untilMapTalking(api, (m) => m === ZONE.fight, 180_000)
    out.boatTalk = await talkLog.take(page)
    note('선단 배 선원 (356,247)', `${said ? '말 걸었다' : '못 걸었다'} · 파이트에리어 ${String(sailed)} · ${JSON.stringify(out.boatTalk.slice(-4))}`)
    if (!sailed) return done()
  }

  // 내리면 라이벌 장면이 프레임 스크립트로 돈다 — 「같이 싸우자」 예 → 태그 배틀. 대사를 넘기며(예를 고른다) 상태 2를 기다린다
  for (let round = 0; round < 3 && (v?.[`v${String(FIGHT_STATE)}`] ?? 0) < 2 && api.left() > 0; round++) {
    await talkLog.start(page)
    if (round > 0) {
      const said = await api.talkToNpc(ZONE.fight, FIGHT_RIVAL_SCRIPT, Math.min(300_000, api.left()))
      note(`라이벌 다시 (${String(round)})`, said ? '말 걸었다' : '못 걸었다')
    }
    await until(api, async () => ((await read())?.[`v${String(FIGHT_STATE)}`] ?? 0) >= 2, 240_000)
    v = await read()
    const talk = await talkLog.take(page)
    const party = await api.partyState()
    note('파이트에리어 태그 배틀', `${JSON.stringify(v)} · 파티 ${JSON.stringify(party?.map((m) => `${String(m.species)} L${String(m.level)} ${String(m.hp)}`))} · ${JSON.stringify(talk.slice(-3))}`)
    if ((v?.[`v${String(FIGHT_STATE)}`] ?? 0) < 2 && (await api.now()).map !== ZONE.fight) {
      // 졌으면 센터에서 깬다 — 파이트에리어 센터는 바로 옆이다
      await api.goTo(ZONE.fight, Math.min(300_000, api.left()))
    }
  }
  if ((v?.[`v${String(FIGHT_STATE)}`] ?? 0) < 2) return done()
  if (v?.[`f${String(FIGHT_BLOCKADE)}`] !== true) {
    note('225번도로 앞 막음', '안 풀렸다 — 깃발 660이 안 섰다 (전국도감이 있으면 태그 배틀 뒤 선다 · scripts_fight_area.s:181)')
    return done()
  }

  /**
   * **서바이벌에리어까지는 225번도로로 걷고, 리조트에리어는 파이트에리어에서 230번수로(파도타기)로 간다.**
   *
   * ⚠️ 226 → 228 → 229로 이어 걷지 않는다 — 228번도로에는 북쪽으로 오르는 모래 비탈(행동 0xd9)이 있고, 하네스의 자전거는 3단이라
   * 비탈을 못 오른다(`route.slopeClimbBan` 머리 주석 — 사람은 B로 4단에 놓고 도움닫기한다). 실측(2026-10-16 진단 1~3판): 228번도로
   * 남쪽 (791,394)까지 갔다가 되돌아 비탈을 내려선 주머니 (785,343)에 갇혔고, 거기서는 비탈 오르기 말고 나가는 길이 없어 걷기로도
   * 자전거로도 「unreachable」이었다. 230번수로 막음(깃발 660)은 태그 배틀 뒤 이미 풀렸다
   */
  const sprayed = await sprayBest(api)
  note('스프레이', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
  const walkTo = async (m, what) => {
    let went = ''
    for (let t = 0; t < 3 && went !== 'arrived' && api.left() > 0; t++) {
      if ((await api.now()).map === m) { went = 'arrived'; break }
      went = await api.goTo(m, Math.min(1_200_000, api.left()))
      note(`${what}${t > 0 ? ` (다시 ${String(t)})` : ''}`, `${went} · 칸 ${JSON.stringify(await api.now().then((n) => [n.map, n.x, n.z]))}`)
      if (went !== 'arrived') {
        const again = await sprayBest(api)
        if (again.ok) note('스프레이', `다시 뿌렸다 (남은 것 ${String(again.left)})`)
      }
    }
    return went
  }
  const toSurvival = [ZONE.fight, ZONE.gate225, ZONE.route225, ZONE.survival]
  const pastSurvival = [ZONE.survival, ZONE.route226, ZONE.gate228, ZONE.route228, ZONE.route229, ZONE.resort]
  if (!pastSurvival.includes((await api.now()).map)) {
    const here = (await api.now()).map
    for (const m of toSurvival.slice(Math.max(0, toSurvival.indexOf(here)) + 1)) {
      if (await walkTo(m, `배틀존 — 맵 ${String(m)}`) !== 'arrived') return done()
    }
  }
  out.survival = true
  if ((await api.now()).map !== ZONE.resort) {
    const fly = await api.flyTo(ZONE.fight, Math.min(180_000, api.left()))
    note('공중날기 → 파이트에리어', fly.ok ? '닿았다' : String(fly.why))
    await walkTo(ZONE.resort, '230번수로 → 리조트에리어')
  }
  out.ok = (await api.now()).map === ZONE.resort
  return done()
}

export const reachedBattleZone = async (api, page) => (await api.now()).map === ZONE.resort
  && ((await varsFlags(page, [FIGHT_STATE]))?.[`v${String(FIGHT_STATE)}`] ?? 0) >= 2

// ── 자전거 길 (227번도로) ─────────────────────────────────────────────────

/**
 * **자전거로만 이어지는 길을 탄다** — 도약대 · 자전거 널 · 4단 전속력.
 *
 * ⚠️ **공용 길잡이(`route.planPath` · `drive.goTo`)는 걸어서만 계획한다** — 자전거 널(0x76~0x7d)에 올라서는 걸음을 막고
 * (`route.deckLayer`), 도약대(0xD7 · 0xD8)는 그냥 벽이며, 4단으로 바꾸지 않는다(`route.slopeClimbBan` 머리 주석). 227번도로는
 * 그 셋이 다 있어야 하드마운틴에 닿는다 — 실측(2026-10-16 진단): 226번수로에서 든 남쪽 주머니 (750~757,317~327)는 북쪽이 턱(0x3B, 남으로만
 * 뛴다)이고, 걸어서는 정적 격자로도 「unreachable」이다. 자전거 너비 우선 탐색(아래)으로는 (761,305) · (754,309)에서 **서쪽 먼 도약**
 * 둘(4단 전속력 · `bikeTerrain.bikeRampHop` — 착지 4칸 앞) → (750,293) 다리 어귀에서 자전거 널을 타고 강을 건너 → 하드마운틴 바깥(262)이다.
 *
 * 그래서 이 다리만 자기 계획을 든다. 원작 규칙을 옮긴 것이 아니라 **제품이 그 규칙으로 막는 것을 길잡이가 알게 한 것**이다:
 * · 도약대: 받는 쪽에서 3칸 이상 곧장 달려와(4단 전속력 = 페달 3칸 · `bike.bikeSpeedLevel`) 그 너머 네 번째 칸에 내린다
 * · 자전거 널: 어귀(0x70)로 올라서면 위층이고, 위층에서는 널끼리만 · 어귀로만 내린다
 * · 턱: 남쪽으로만 두 칸 · 비탈(0xD9 · 0xDA): 북쪽 금지(이 길에는 없다) · 물: 자전거는 못 들어간다
 */
const RAMP = { 0xd7: 1, 0xd8: -1 }
const isBikeDeckB = (b) => b >= 0x76 && b <= 0x7d
const isDeckB = (b) => b >= 0x71 && b <= 0x75
export function planBike(from, layer0, goalZone) {
  const g = gridOf(0)
  const B = (x, z) => g.at(x, z) & 0x7fff
  const open = (x, z) => !g.blocked(x, z) && !waterAt(0, x, z)
  const id = (x, z, l) => `${String(x)},${String(z)},${String(l)}`
  const prev = new Map([[id(from.x, from.z, layer0), null]])
  const q = [[from.x, from.z, layer0]]
  let hit = null
  const dirs = [['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowDown', 0, 1], ['ArrowUp', 0, -1]]
  while (q.length > 0 && hit === null) {
    const [x, z, l] = q.shift()
    for (const [key, dx, dz] of dirs) {
      let nx = x + dx; let nz = z + dz; let nl = l
      const b = B(nx, nz); const here = B(x, z)
      let move = { key, x: nx, z: nz }
      if (RAMP[b] !== undefined) {
        if (RAMP[b] !== dx || dz !== 0) continue
        // 도약대 — 4단 전속력은 **도약대 앞 칸에 들어설 때** 페달이 3칸 넘게 쌓여 있어야 난다(`player`가 칸이 바뀌는 순간
        // 앞 칸을 본다). 도움닫기는 실행이 앞 걸음들을 멈추지 않고 이어 달려 만든다(`bikeTo`) — 계획은 착지만 본다
        nx = x + dx * 4
        if (!open(nx, nz)) continue
        move = { key, x: nx, z: nz, ramp: true }
      } else if (b === 0x3b) {
        if (dz !== 1) continue
        nz = z + 2
        if (!open(nx, nz)) continue
        move = { key, x: nx, z: nz, ledge: true }
      } else if ((b === 0xd9 || b === 0xda) && dz === -1) {
        continue
      } else if (b === 0x70) {
        if (l === 0 && (isDeckB(here) || isBikeDeckB(here))) continue
        nl = 1
      } else if (isBikeDeckB(b) || isDeckB(b)) {
        nl = isBikeDeckB(here) || isDeckB(here) || here === 0x70 ? l : 0
        if (nl === 0 && !open(nx, nz)) continue
      } else {
        if (l === 1 && (isDeckB(here) || isBikeDeckB(here))) continue
        nl = 0
        if (!open(nx, nz)) continue
      }
      if (g.zoneAt(nx, nz) < 0) continue
      const k = id(nx, nz, nl)
      if (prev.has(k)) continue
      prev.set(k, { from: id(x, z, l), move: { ...move, layer: nl } })
      if (g.zoneAt(nx, nz) === goalZone) { hit = k; break }
      q.push([nx, nz, nl])
    }
  }
  if (hit === null) return null
  const moves = []
  for (let k = hit; prev.get(k) !== null; k = prev.get(k).from) moves.push(prev.get(k).move)
  return moves.reverse()
}

async function bikeTo(api, ctx, page, goalZone, note) {
  const out = { ramps: 0, steps: 0, replans: 0 }
  const player = () => page.evaluate(async () => {
    const p = (await import('/src/state/worldState.ts')).worldState.player
    return { cycling: p.cycling === true, gear: p.bikeGear, pedalling: p.pedalling }
  }).catch(() => null)
  const bike = await api.rideBike(Math.min(120_000, api.left()))
  let pl = await player()
  note('자전거', `${JSON.stringify(bike).slice(0, 80)} · ${JSON.stringify(pl)}`)
  // 4단 — 우리 키 B (`engine/input/keys`의 `gear`). 바뀌었는지는 제품 값을 읽어 본다(`bike.BIKE_GEAR`)
  const fourth = await page.evaluate(async () => (await import('/src/engine/actor/bike.ts')).BIKE_GEAR.fourth).catch(() => null)
  for (let i = 0; i < 2 && pl?.gear !== fourth; i++) { await api.tap('KeyB', 120); pl = await player() }
  note('4단', `${String(pl?.gear)} (4단 ${String(fourth)})`)
  if (pl?.gear !== fourth) return out
  let layer = 0
  for (let round = 0; round < 12 && api.left() > 0; round++) {
    const at = await api.now()
    if (gridOf(0).zoneAt(at.x, at.z) === goalZone) { out.ok = true; return out }
    const plan = planBike({ x: at.x, z: at.z }, layer, goalZone)
    if (plan === null) { note('자전거 길', `(${String(at.x)},${String(at.z)}) 층 ${String(layer)}에서 길이 없다`); return out }
    if (round > 0) out.replans++
    let off = false
    /**
     * 도약대 앞에서는 **멈추지 않고 이어 달린다** — 앞 걸음 넷 이상(앞선 도약 · 턱 뒤부터)을 키를 놓지 않고 바꿔 쥐며 탄다.
     * 실측(2026-10-16 진단 3판): (764,305)에서 곧게 셋을 달려 들어가면 가까운 도약(759)에 내렸다 — 앞 칸 (761)에 들어서는 순간의
     * 페달이 2.5칸이었다. 둘째 도약대 (753,309)는 뒤가 셋뿐이라 (757,305)에서 남으로 넷을 내려온 기세를 그대로 서쪽으로 꺾어 간다
     */
    const RUN = 5
    for (let i = 0; i < plan.length && !off; i++) {
      const m = plan[i]
      const rampAt = plan.findIndex((x, j) => j >= i && x.ramp)
      const runStart = rampAt < 0 ? -1 : Math.max(i, rampAt - RUN)
      const special = rampAt < 0 ? false : plan.slice(runStart, rampAt).some((x) => x.ledge)
      if (rampAt >= 0 && i === runStart && !special) {
        const seq = plan.slice(runStart, rampAt + 1)
        const before = await api.now()
        let held = null
        let reached = 0
        for (const s2 of seq) {
          if (held !== s2.key) {
            await page.keyboard.down(s2.key)
            if (held !== null) await page.keyboard.up(held)
            held = s2.key
          }
          let ok = false
          for (let t = 0; t < 80; t++) {
            const n = await api.now()
            if (n.x === s2.x && n.z === s2.z) { ok = true; break }
            if (n.scene !== 'overworld' || n.talk) break
            await page.waitForTimeout(10)
          }
          if (!ok) break
          reached++
        }
        if (held !== null) await page.keyboard.up(held)
        await api.settle()
        const after = await api.now()
        const ramp = seq.at(-1)
        out.ramps++
        note('도약대', `${String(seq.length - 1)}칸 도움닫기 (${String(before.x)},${String(before.z)}) → (${String(after.x)},${String(after.z)}) · 노린 칸 (${String(ramp.x)},${String(ramp.z)}) · ${String(reached)}/${String(seq.length)}`)
        if (after.x !== ramp.x || after.z !== ramp.z) { off = true; break }
        layer = ramp.layer
        i = rampAt
        continue
      }
      const n = await api.stepKey(m.key, { x: m.x, z: m.z })
      out.steps++
      if (n.scene === 'battle' || n.talk) { await api.settle(); off = true; break }
      if (n.x !== m.x || n.z !== m.z) { off = true; break }
      layer = m.layer
    }
    if (!off) {
      const end = await api.now()
      if (gridOf(0).zoneAt(end.x, end.z) === goalZone) { out.ok = true; return out }
    }
    // 어긋났으면 지금 칸에서 다시 — 층은 지금 칸이 널이면 위로 친다
    const n = await api.now()
    const b = gridOf(0).at(n.x, n.z) & 0x7fff
    layer = isBikeDeckB(b) || isDeckB(b) ? 1 : 0
  }
  return out
}

// ── 바위 방 ────────────────────────────────────────────────────────────────

/** 턱 → 뛰는 방향 (`badgesLeague`의 `LEDGE`와 같은 표) */
const LEDGE = { 0x38: [1, 0], 0x39: [-1, 0], 0x3a: [0, -1], 0x3b: [0, 1] }
/**
 * **큰바위를 밀고 바위를 깨서 그 문 옆까지** — 챔피언로드 2F와 같은 걸음(`badgesLeague.victory2F`): 구운 격자와 처음 바위 자리로
 * `pushSolve`가 풀고, 민 것 · 깬 것만 차례로 한다(그 사이 걸음은 `strengthPush` · `smashRock`이 맡는다). 바위는 맵에 들 때마다 제자리다.
 * 실측(2026-10-16 진단 4판): 하드마운틴 방 1(263)은 입구 (17,29)에서 북쪽 문 (17,2)까지 공용 길잡이로 「unreachable」 — (11,11) 바위와
 * (18,9) · (27,13) 큰바위가 길을 가른다
 */
async function pushThrough(api, ctx, map, door, note, page, avoid = []) {
  const g = gridOf(matrixOf(map))
  /** 지금 보이는 큰바위 · 바위 · 사람 — 제품의 물체 자리를 읽는다(`npcActors` · 읽기만). 밀다 만 판은 이 자리에서 다시 푼다 */
  const live = () => page.evaluate(async () => (await import('/src/engine/actor/npcs.ts')).npcActors.list
    .filter((a) => a.visible).map((a) => [Math.round(a.x), Math.round(a.z), a.gfx])).catch(() => [])
  let last = null
  for (let round = 0; round < 4 && api.left() > 0; round++) {
    const actors = await live()
    const people = new Set(actors.filter(([, , gfx]) => gfx !== 84 && gfx !== 85).map(([x, z]) => `${String(x)},${String(z)}`))
    let here = await api.now()
    if (here.map !== map) {
      /**
       * ⚠️ **넘어간 데가 그 문의 저쪽일 때만 통과다.** 실측(2026-10-21 진단 `9df2573f` 칸 20): 하드마운틴 방 1에서 바위 뒤 칸으로 가던 걸음이
       * 입구 계단 (20,29)를 밟아 바깥(262)으로 나갔는데 「통과」로 세고 방 2로 가다 칸을 잃었다. 다른 데로 샜으면 방으로 돌아와 다시 푼다
       */
      const dest = warpsOf(map).find((w) => w.x === door.x && w.z === door.z)?.to
      if (dest === undefined || here.map === dest) return { ok: true, why: `맵 ${String(here.map)}` }
      note(`맵 ${String(map)} 바위`, `맵 ${String(here.map)}로 샜다 — 돌아간다`)
      const back = await api.goTo(map, Math.min(300_000, api.left()))
      here = await api.now()
      if (here.map !== map) return { ok: false, why: `맵 ${String(here.map)}로 샜다가 못 돌아왔다 (${String(back)})` }
      // 막 들어선 맵은 바위가 아직 안 섰다 — 안 기다리면 바위 없는 방으로 풀어 「밀기 0」이 나온다
      await api.settle()
      for (const till = Date.now() + 15_000; Date.now() < till;) {
        if ((await live()).some(([, , gfx]) => gfx === 84 || gfx === 85)) break
        await page.waitForTimeout(250)
      }
      continue
    }
    const plan = solvePush({
      start: { x: here.x, z: here.z },
      wall: (x, z) => x < 0 || z < 0 || x >= g.w || z >= g.h || g.blocked(x, z) || people.has(`${String(x)},${String(z)}`)
        || avoid.some((a) => a.x === x && a.z === z),
      ledge: (x, z) => LEDGE[g.at(x, z) & 0x7fff] ?? null,
      boulders: actors.filter(([, , gfx]) => gfx === 84).map(([x, z]) => [x, z]),
      rocks: actors.filter(([, , gfx]) => gfx === 85).map(([x, z]) => [x, z]),
      goal: (x, z) => Math.abs(x - door.x) + Math.abs(z - door.z) === 1,
    })
    if (plan === null) return { ok: false, why: `(${String(here.x)},${String(here.z)})에서 풀이가 없다 (${String(round + 1)}번째)` }
    const acts = plan.moves.filter((m) => m.kind === 'push' || m.kind === 'smash')
    note(`맵 ${String(map)} 바위 풀이 ${String(round + 1)}`, `밀기 ${String(plan.pushes)} · 깨기 ${String(plan.smashes)} — ${acts.map((m) => `${m.kind === 'push' ? '밀기' : '깨기'} (${String(m.at.x)},${String(m.at.z)})${m.key}`).join(' ')}`)
    last = null
    for (const m of acts) {
      const r = m.kind === 'push'
        ? await api.strengthPush(map, m.at, m.key, 1, Math.min(300_000, api.left()))
        : await api.smashRock(map, m.at, Math.min(300_000, api.left()))
      if (!r.ok) { last = `(${String(m.at.x)},${String(m.at.z)}) ${m.kind} 실패 — ${String(r.why ?? '')} · 지금 칸 ${JSON.stringify(await api.now().then((n) => [n.x, n.z]))}`; break }
    }
    if (last !== null) { note(`맵 ${String(map)} 바위`, `${last} — 지금 자리에서 다시 푼다`); continue }
    let went = await boardWarp(api, map, door, Math.min(600_000, api.left()))
    if (went !== 'arrived') {
      /**
       * ⚠️ 실측(2026-10-16 진단 6판): 방 1 북쪽 계단 (17,2) — `boardWarp`의 `stepOn`이 (17,3)에 「arrived」를 내고 (18,3)에 서 있었다.
       * 문 바로 아래 칸으로 한 칸씩 맞춰 서서 북쪽을 길게 민다
       */
      const below = { x: door.x, z: door.z + 1 }
      for (let i = 0; i < 4; i++) {
        const n = await api.now()
        if (n.x === below.x && n.z === below.z) break
        const key = n.x !== below.x ? (below.x < n.x ? 'ArrowLeft' : 'ArrowRight') : (below.z < n.z ? 'ArrowUp' : 'ArrowDown')
        await api.stepKey(key, { x: n.x + Math.sign(below.x - n.x), z: n.x === below.x ? n.z + Math.sign(below.z - n.z) : n.z })
      }
      await page.keyboard.down('ArrowUp')
      for (let i = 0; i < 40 && (await api.now()).map === map; i++) await page.waitForTimeout(100)
      await page.keyboard.up('ArrowUp')
      await api.settle()
      const after = await api.now()
      went = after.map !== map ? 'arrived' : `${went} · 아래 칸에서 길게 밀어도 그대로 (${String(after.x)},${String(after.z)})`
    }
    return { ok: went === 'arrived', why: went }
  }
  return { ok: false, why: last }
}

// ── q 하드마운틴과 히드런 ───────────────────────────────────────────────────────

/**
 * 하드마운틴 맵 · 변수 (`map_headers.txt` 줄 − 1 · `vars_flags.txt` 열거형 셈 — `_pg42.design.md`와 같은 셈):
 *
 * · 227번도로 403: 좌표 사건 (738~739,306) 16523 `VAR_ROUTE_227_WAKE_RIVAL_STATE` 0 → 1 · (758,277) 16665 `VAR_ROUTE_227_BUCK_STATE`
 *   0 → 1(벅이 「같이 가자」 — 예가 나올 때까지 되묻는다)
 * · 하드마운틴 바깥 262: (752,235) 16544 `VAR_STARK_MOUNTAIN_OUTSIDE_STATE` 0 → 1 · 셋째 방 뒤 2 → 바깥 장면 3
 * · 방 1 263: 들어서면 프레임 스크립트로 마스 · 쥬피터 연전 16557 0 → 1
 * · 방 2 264: (42,69) 16532 0 → 1 벅이 동행(`SetHasPartner`) · (42,70)을 밟으면 0으로 돌아간다 · (47,3) 1 → 2 벅이 떠난다
 * · 방 3 265: 프레임 스크립트 — 플루토 · 국제경찰. 끝에 16542 `VAR_STARK_MOUNTAIN_ROOM_3_STATE` 1 · 214 `FLAG_ARRESTED_CHARON_STARK_MOUNTAIN`
 *   (`scripts_stark_mountain_room_3.s:226-236`) → 바깥 (751,233)으로 옮긴다
 * · 배틀그라운드 454: 벅 (11,8) 스크립트 2 → 293 `FLAG_TALKED_TO_BATTLEGROUND_BUCK` (`scripts_battleground.s:114-129`)
 * · 방 3 히드런 (7,6) 스크립트 4: 들어설 때 288 미포획 · 전당 · 전국도감 · 293 · 16542 == 1이면 보인다(`:27-36`) →
 *   `StartLegendaryBattle 485 Lv50` · 215 `FLAG_BATTLED_STARK_MOUNTAIN_ROOM_3_HEATRAN` · 16542 = 2(지면 1로)
 *
 * ⚠️ 사천왕 재대결 · 전당 재등록은 필요 없다 — 체포 장면이 이미 16542 = 1로 둔다. 전당 스크립트는 **쓰러뜨리고 못 잡은** 히드런을
 * 되살릴 때만 쓴다(`scripts_pokemon_league_hall_of_fame.s:128,158-162`)
 */
export const STARK = {
  survival: 450, survivalCenter: 452, battleground: 454, route227: 403, outside: 262, room1: 263, room2: 264, room3: 265,
}
const V = { wake: 16523, buck227: 16665, outside: 16544, room1: 16557, room2: 16532, room3: 16542 }
const F = { charon: 214, buckTalked: 293, heatranBattled: 215, heatranCaught: 288 }
const BATTLEGROUND_BUCK_SCRIPT = 2
/** 바깥 벅의 숨김 깃발 · 선 자리 (`events_survival_area` 8번) */
const BUCK_OUTSIDE_GONE = 555
const BUCK_OUTSIDE = { x: 652, z: 339 }
const HEATRAN_SCRIPT = 4

/**
 * **하드마운틴 셋째 방까지 간다** — 서바이벌에서 226 → 227번도로(자전거 길 · `bikeTo`) → 바깥 → 방 1(바위) → 방 2(바위) → 방 3.
 * 바위는 맵에 들 때마다 제자리라(REPAIR §126) 다시 들 때도 다시 민다. 벅이 없으면 방 2는 락클라임도 되지만 풀이는 걷기 · 밀기 · 깨기로 같다
 */
async function toStarkRoom3(api, ctx, page, note) {
  const at = () => api.now().then((n) => n.map)
  if (![STARK.outside, STARK.room1, STARK.room2, STARK.room3].includes(await at())) {
    if ((await at()) !== STARK.route227) {
      const fly = await api.flyTo(450, Math.min(180_000, api.left()))
      note('공중날기 → 서바이벌에리어', fly.ok ? '닿았다' : String(fly.why))
      note('227번도로', await api.goTo(STARK.route227, Math.min(900_000, api.left())))
    }
    const sprayed = await sprayBest(api)
    note('스프레이', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    note('227번도로 자전거 길', JSON.stringify(await bikeTo(api, ctx, page, STARK.outside, note)))
    // 자전거 길이 끝을 못 맺고 227번도로에 남았으면 걸어서 마저 간다 — 그대로 두면 바위 방을 풀이 없이 길잡이로 밀고 들어가
    // 방 1에서 선다. 실측(2026-10-20 진단 `d73fd793` 칸 20): 도약대 둘만 넘고 403에 남아 방 1 (17,29)에서 31분을 썼다
    if ((await at()) === STARK.route227) note('바깥으로 걸어서', await api.goTo(STARK.outside, Math.min(600_000, api.left())))
  }
  if ((await at()) === STARK.outside) note('방 1로', await api.goTo(STARK.room1, Math.min(300_000, api.left())))
  if ((await at()) === STARK.room1) note('방 1 바위', JSON.stringify(await pushThrough(api, ctx, STARK.room1, { x: 17, z: 2 }, note, page)))
  if ((await at()) === STARK.room2) {
    // 입구 (42,86)에서 (42,69)까지는 락클라임 길이다 — 걸어 올라가(길잡이) 벅 자리에서 바위 풀이를 시작한다 (진단 9판: 입구에서는 풀이가 없다)
    const n = await api.now()
    if (n.z > 69) note('방 2 (42,69)로', await api.stepOn(STARK.room2, { x: 42, z: 69 }, Math.min(600_000, api.left())))
    note('방 2 바위', JSON.stringify(await pushThrough(api, ctx, STARK.room2, { x: 47, z: 2 }, note, page, [{ x: 42, z: 70 }])))
  }
  return (await at()) === STARK.room3
}

/**
 * **하드마운틴에서 걸어 나온다** — 동굴 안에서는 공중날기가 안 된다. 가방에 동굴탈출로프가 없다(칸 20 끝 세이브 실측). 방 3 → 방 2(락클라임으로
 * 내려간다 · 길잡이) → 방 1(바위가 제자리로 돌아와 있다 — 바위 풀이로 입구 (20,29)까지) → 바깥
 */
export async function leaveStark(api, ctx, page, note) {
  const at = () => api.now().then((n) => n.map)
  if ((await at()) === STARK.room3) note('방 3 → 방 2', await api.goTo(STARK.room2, Math.min(300_000, api.left())))
  if ((await at()) === STARK.room2) note('방 2 → 방 1', await api.goTo(STARK.room1, Math.min(900_000, api.left())))
  if ((await at()) === STARK.room1) note('방 1 → 바깥', JSON.stringify(await pushThrough(api, ctx, STARK.room1, { x: 20, z: 29 }, note, page)))
  return (await at()) === STARK.outside || ![STARK.room1, STARK.room2, STARK.room3].includes(await at())
}

export async function starkHeatran(api, ctx, page) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const read = async () => {
    const r = await varsFlags(page, Object.values(V), Object.values(F))
    return Object.fromEntries([...Object.entries(V).map(([k, id]) => [k, r?.[`v${String(id)}`]]),
      ...Object.entries(F).map(([k, id]) => [k, r?.[`f${String(id)}`]])])
  }
  /** 좌표 사건 칸을 밟고 그 변수가 오를 때까지 대사를 넘긴다 */
  const trip = async (map, spot, key, want, what) => {
    const before = (await read())[key]
    if (before >= want) return true
    await talkLog.start(page)
    const went = await api.stepOn(map, spot, Math.min(600_000, api.left()))
    const ok = await until(api, async () => ((await read())[key] ?? 0) >= want, 180_000)
    note(what, `${went} · ${key} ${String(before)} → ${String((await read())[key])} · ${JSON.stringify((await talkLog.take(page)).slice(-3))}`)
    return ok === true
  }
  let v = await read()
  note('처음', JSON.stringify(v))

  // 이미 하드마운틴 안이면(앞 판이 거기서 멈췄다) 거기서 잇는다 — 방 상태 값이 어디까지 갔는지를 말한다
  const inside = [STARK.outside, STARK.room1, STARK.room2, STARK.room3].includes((await api.now()).map)
  if (!v.charon && !inside) {
    const fly = await api.flyTo(450, Math.min(180_000, api.left()))
    note('공중날기 → 서바이벌에리어', fly.ok ? '닿았다' : String(fly.why))
    const heal = await api.healAt(STARK.survivalCenter, Math.min(300_000, api.left()))
    note('서바이벌에리어 센터 회복', heal.ok ? '나았다' : String(heal.why))
    const r227 = await api.goTo(STARK.route227, Math.min(900_000, api.left()))
    note('227번도로', r227)
    /**
     * ⚠️ **227번도로의 두 장면은 길목이 아니다** — 16523 · 16665를 뒤에서 보는 스크립트가 없다(`scripts_route_227.s`만 쓴다).
     * 걷는 길이 그 칸을 지나면 돌고, 안 지나면 안 돈다 — 값만 적는다. 실측(2026-10-16 진단 1판): (738,306)은 226번수로에서
     * 들어선 (754,319) 쪽에서 「설 길이 없다」(비탈 · 화산재 너머)였다
     */
    v = await read()
    note('227번도로 장면', `맥실러 · 라이벌 ${String(v.wake)} · 벅 ${String(v.buck227)} (길목 아님 — 적기만)`)
    // 227번도로는 자전거 길이다(위 `bikeTo` 머리 주석) — 공용 길잡이로는 남쪽 주머니에서 못 나온다
    const sprayed = await sprayBest(api)
    note('스프레이', sprayed.ok ? `뿌렸다 (남은 것 ${String(sprayed.left)})` : String(sprayed.why))
    const rode = await bikeTo(api, ctx, page, STARK.outside, note)
    note('227번도로 자전거 길', JSON.stringify(rode))
  }
  if (!v.charon) {
    if ((v.outside ?? 0) < 1) {
      const outside = await api.goTo(STARK.outside, Math.min(900_000, api.left()))
      note('하드마운틴 바깥', outside)
      if (!await trip(STARK.outside, { x: 752, z: 235 }, 'outside', 1, '바깥 조무래기 (752,235)')) return done()
    }
    if ((v.room1 ?? 0) < 1 || ![STARK.room1, STARK.room2, STARK.room3].includes((await api.now()).map)) {
      const r1 = await api.goTo(STARK.room1, Math.min(300_000, api.left()))
      await until(api, async () => ((await read()).room1 ?? 0) >= 1, 300_000)
      v = await read()
      note('방 1 — 마스 · 쥬피터', `${r1} · 상태 ${String(v.room1)}`)
      if ((v.room1 ?? 0) < 1) return done()
    }
    let r2 = await api.goTo(STARK.room2, Math.min(600_000, api.left()))
    // ⚠️ 방 1이 아니어도 푼다 — `pushThrough`가 방 1로 돌아가서 푼다. 실측(2026-10-27 맥 최종 연쇄 칸 20): 길잡이의 마지막 「한 발 물러나기」가
    // 입구 계단 (20,29)를 밟아 바깥(262)에 선 채로 끝나, 「방 1일 때만」 조건에 걸려 바위 풀이를 한 번도 안 하고 칸을 잃었다
    if (r2 !== 'arrived' && (await api.now()).map !== STARK.room2) r2 = JSON.stringify(await pushThrough(api, ctx, STARK.room1, { x: 17, z: 2 }, note, page))
    note('방 2', r2)
    if (!await trip(STARK.room2, { x: 42, z: 69 }, 'room2', 1, '방 2 벅 동행 (42,69)')) return done()
    // 벅을 데리고 (47,3)을 지나 셋째 방으로 — 플루토 장면이 끝나면 바깥으로 옮겨진다
    await talkLog.start(page)
    /**
     * ⚠️ **벅이 따라오는 동안은 락클라임 · 파도타기 · 공중날기를 못 쓴다** — 원작 `field_move_tasks.c` `PlayerTravellingWithPartner`
     * (381 날기 · 426 파도타기 · 639 락클라임 · 717 순간이동 · 764 구멍파기). 괴력 · 바위깨기는 된다. 실측(2026-10-16 진단 7판): 길잡이가
     * (38,57)에서 북쪽 락클라임을 골라 20분을 「못 탔다」로 되밀렸다. 그래서 방 2는 걸음 · 밀기 · 깨기만으로 푼다(`pushThrough`)
     * — 하네스 기억의 파도타기 · 락클라임은 벅이 떠난 뒤 되돌린다
     */
    const modes = api.harnessMemory?.() ?? {}
    api.setClimb(false); api.setSurf(false); api.setWaterfall(false)
    const r3 = JSON.stringify(await pushThrough(api, ctx, STARK.room2, { x: 47, z: 2 }, note, page, [{ x: 42, z: 70 }]))
    // (42,70)을 밟으면 벅이 「떨어졌다」로 상태가 0이 된다 — 풀이에서 벽으로 친다
    api.setClimb(modes.climb !== false); api.setSurf(modes.surf !== false); api.setWaterfall(modes.waterfall !== false)
    await until(api, async () => (await read()).charon === true && ((await read()).outside ?? 0) >= 3, 300_000)
    v = await read()
    note('방 3 — 플루토 체포', `${r3} · ${JSON.stringify(v)} · 맵 ${String((await api.now()).map)} · ${JSON.stringify((await talkLog.take(page)).slice(-3))}`)
    if (!v.charon) return done()
  }

  if (!v.buckTalked) {
    const fly = await api.flyTo(450, Math.min(180_000, api.left()))
    note('공중날기 → 서바이벌에리어', fly.ok ? '닿았다' : String(fly.why))
    /**
     * **바깥 벅이 배틀그라운드 문(652,338) 앞을 막고 선다** — 플루토 체포 뒤 숨김 깃발 555가 내려가 (652,339)에 나온다.
     * 말을 걸면 문으로 들어가 `RemoveObject`된다(`scripts_survival_area.s` `SurvivalArea_Buck`). 사람을 뚫고 걷던 동안은 그냥
     * 지나갔다 — 실측(2026-10-20 진단 `ab9ad9f5` 칸 20): 450에서 454로 가는 길이 없다고 27분을 돌았다
     */
    if ((await api.flag(BUCK_OUTSIDE_GONE)) === false) {
      const outside = await api.talkTo(STARK.survival, BUCK_OUTSIDE, Math.min(300_000, api.left()))
      await api.clearTalk(); await api.settle()
      note('배틀그라운드 문 앞 벅 (652,339)', outside ? '말 걸었다' : '못 걸었다')
    }
    const said =await api.talkToNpc(STARK.battleground, BATTLEGROUND_BUCK_SCRIPT, Math.min(600_000, api.left()))
    await until(api, async () => (await read()).buckTalked === true, 60_000)
    v = await read()
    note('배틀그라운드 벅 (11,8)', `${said ? '말 걸었다' : '못 걸었다'} · 293 ${String(v.buckTalked)}`)
    if (!v.buckTalked) return done()
  }

  if (!v.heatranBattled && !v.heatranCaught) {
    // 산 안이면 회복하러 안 나간다 — 바위 방을 거꾸로 못 지난다(바위가 제자리로 돌아온다). 파티는 L85~95다
    if (![STARK.outside, STARK.room1, STARK.room2, STARK.room3].includes((await api.now()).map)) {
      const heal = await api.healAt(STARK.survivalCenter, Math.min(300_000, api.left()))
      note('서바이벌에리어 센터 회복', heal.ok ? '나았다' : String(heal.why))
    }
    note('방 3', String(await toStarkRoom3(api, ctx, page, note)))
    const foe = []
    const watch = setInterval(() => {
      page.evaluate(async () => {
        const bs = (await import('/src/state/battleStore.ts')).useBattleStore.getState()
        const a = bs.view?.active ?? {}
        return Object.values(a).map((m) => `${String(m?.species)} L${String(m?.level)}`)
      }).then((x) => { for (const one of x) if (!foe.includes(one)) foe.push(one) }).catch(() => {})
    }, 1000)
    const said = await api.talkToNpc(STARK.room3, HEATRAN_SCRIPT, Math.min(600_000, api.left()))
    await until(api, async () => (await read()).heatranBattled === true && (await api.now()).scene === 'overworld', 300_000)
    clearInterval(watch)
    v = await read()
    out.battle = foe
    note('히드런 (7,6)', `${said ? '말 걸었다' : '못 걸었다'} · 배틀에 선 것 ${JSON.stringify(foe)} · ${JSON.stringify(v)}`)
  }
  out.ok = v.heatranBattled === true || v.heatranCaught === true
  return done()
}

export const reachedHeatran = async (page) => {
  const r = await varsFlags(page, [V.room3], [F.heatranBattled, F.heatranCaught, F.charon])
  return r !== null && r[`f${String(F.charon)}`] === true && (r[`f${String(F.heatranBattled)}`] === true || r[`f${String(F.heatranCaught)}`] === true)
}

// ── p 배틀 팩토리 한 판 ─────────────────────────────────────────────────────

/**
 * 프런티어 맵: 파이트에리어 188 → 프런티어 게이트 560 → 배틀프런티어 559 → 배틀 팩토리 로비 562. 프런티어는 **팩토리만** 범위다
 * (메모 no-out-of-scope — 다른 시설은 입구가 막혀 있다). 접수원 (21,6) 스크립트 1 — 계산대(22,6) 너머라 한 칸 아래 (21,7)에서 북쪽을 본다.
 *
 * ⚠️ **`talkTo`로 말을 걸지 않는다** — 그것은 말이 열리면 `settle`로 대사를 넘기고, 셋 이상 고르는 줄에서는 **마지막 칸**(그만둔다)을
 * 고른다(`drive.clearTalk`). 접수원 물음은 첫 칸이 싱글 · 레벨50 · 예다. 그래서 진단 탐침 `_factory.mjs`처럼 A만 눌러 빌리는 화면까지 간다
 *
 * 한 판의 뜻: 도전을 열고 → 셋을 빌리고 → 배틀을 치르고 → 도전이 로비에서 닫힐 때까지(지면 「또 오세요」 · 이기면 「포기한다」).
 * 일곱 연승은 빌린 셋의 운이라 판을 가르지 못한다 — 이긴 판 수는 적기만 한다
 */
export const FRONTIER = { fight: 188, gate: 560, frontier: 559, factory: 562 }
const FACTORY_DESK = { x: 21, z: 7 }
/** 16567 `VAR_FRONTIER_LOAD_ACTION`(도전 중 0xFF · 끝 0) · 16464 출력 상태 — `_factory.mjs`와 같은 번호 */
const LOAD_ACTION = 16567

const factoryState = (page) => page.evaluate(async (load) => {
  const f = await import('/src/engine/script/field.ts')
  const s = await import('/src/state/saveStore.ts')
  const fs = await import('/src/state/factoryStore.ts')
  const d = document.documentElement.dataset
  const save = s.useSaveStore.getState()
  const fac = fs.useFactoryStore.getState()
  return {
    map: Number(d.map), talk: d.talk === '1', script: d.script === '1', stage: d.frontierStage === '1', scene: d.scene ?? null,
    load: f.fieldScripts.vars.get(load), phase: fac.phase, battle: fac.round?.battle ?? null, streak: fac.round?.streak ?? null,
    record: save.factory.records[0], bp: save.battlePoints,
  }
}, LOAD_ACTION).catch((e) => ({ why: String(e?.message ?? e).slice(0, 160) }))

export async function factoryRun(api, ctx, page) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; return out }
  const tap = async (key = 'KeyZ', ms = 90) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(ms) }
  const pushUntil = async (ok, cap = 300, key = 'KeyZ') => {
    for (let i = 0; i < cap; i++) {
      const s = await factoryState(page)
      if (ok(s)) return { ok: true, taps: i, s }
      await tap(key)
    }
    return { ok: false, taps: cap, s: await factoryState(page) }
  }
  const menuUp = (label) => page.locator(`[role="radiogroup"][aria-label="${label}"]`).count().then((n) => n > 0)
  const pushUntilMenu = async (label, cap = 120) => {
    for (let i = 0; i < cap; i++) { if (await menuUp(label)) return true; await tap(); await page.waitForTimeout(200) }
    return false
  }
  /** 장면 · 대사 · 스크립트가 1.5초 조용할 때까지 — 대사창이 떠 있을 때만 누른다(`_factory.mjs` 같은 까닭) */
  const pushUntilQuiet = async (cap = 400) => {
    let since = -1
    for (let i = 0; i < cap; i++) {
      const s = await factoryState(page)
      const quiet = !s.stage && !s.script && !s.talk
      if (quiet && since < 0) since = Date.now()
      if (!quiet) since = -1
      if (quiet && Date.now() - since > 1500) return { ok: true, s }
      if (quiet || !s.talk) { await page.waitForTimeout(200); continue }
      await tap()
    }
    return { ok: false, s: await factoryState(page) }
  }

  let s = await factoryState(page)
  note('처음', JSON.stringify(s))
  const heal = await api.healAt(189, Math.min(300_000, api.left()))
  note('파이트에리어 센터 회복', heal.ok ? '나았다' : String(heal.why))
  for (const m of [FRONTIER.gate, FRONTIER.frontier, FRONTIER.factory]) {
    const went = await api.goTo(m, Math.min(600_000, api.left()))
    note(`프런티어 — 맵 ${String(m)}`, went)
    if (went !== 'arrived') return done()
  }
  const stood = await api.stepOn(FRONTIER.factory, FACTORY_DESK, Math.min(300_000, api.left()))
  await tap('ArrowUp', 40)
  note('접수원 앞 (21,7)', stood)

  // 접수원 → 싱글 · 레벨50 · 저장(예) → 복도 → 빌리는 화면. A만 누른다 (첫 칸들)
  await talkLog.start(page)
  const began = await pushUntil((x) => x.phase === 'rental', 400)
  note('빌리는 화면', `${String(began.ok)} · 누름 ${String(began.taps)} · ${JSON.stringify(began.s)}`)
  if (!began.ok) { out.talk = await talkLog.take(page); note('대사', JSON.stringify(out.talk.slice(-6))); return done() }
  for (let i = 0; i < 3; i++) {
    await tap(); await page.waitForTimeout(150)
    await tap(); await page.waitForTimeout(150)
    if (i < 2) await tap('ArrowDown')
  }
  await tap(); await page.waitForTimeout(500)
  s = await factoryState(page)
  note('셋을 빌렸다', `단계 ${String(s.phase)}`)

  // 배틀 — 첫 기술을 누르고, 쓰러져 바꿔야 하면 아래 칸을 고른다
  out.battles = []
  for (let round = 0; round < 7; round++) {
    const opened = await pushUntil((x) => x.scene === 'battle' || x.phase === 'off', 200)
    if (opened.s.scene !== 'battle') break
    let pick = 1
    let closed = false
    for (let i = 0; i < 1500; i++) {
      s = await factoryState(page)
      if (s.phase !== 'battle') { closed = true; break }
      const forced = await page.evaluate(async () => {
        const a = (await import('/src/state/battleStore.ts')).useBattleStore.getState().actions
        return a.filter((x) => x.type === 'move').length === 0 && a.some((x) => x.type === 'switch')
      }).catch(() => false)
      if (forced) {
        for (let k = 0; k < 6; k++) await tap('ArrowUp', 35)
        for (let k = 0; k < pick; k++) await tap('ArrowDown', 35)
        pick = (pick % 2) + 1
      }
      await tap('Space', 60)
    }
    // 복도로 돌아와 첫 말이 뜰 때까지 — 이기면 판 수가 오른다
    s = await factoryState(page)
    for (let i = 0; i < 60 && !s.talk && s.stage; i++) { await page.waitForTimeout(200); s = await factoryState(page) }
    const won = closed && (s.battle ?? 0) > round
    out.battles.push({ round: round + 1, closed, won, battle: s.battle, streak: s.streak })
    note(`${String(round + 1)}판`, `${closed ? '닫혔다' : '안 닫혔다'} · ${won ? '이겼다' : '졌다'} · 판 수 ${String(s.battle)} · 연승 ${String(s.streak)}`)
    if (!closed || !won) break
    // 한 판 이겼으면 여기서 접는다 — 판 사이 목록 → 「포기한다」(아래 두 칸) → 「중지하겠습니까?」 예
    const listed = await pushUntilMenu('선택')
    await tap('ArrowDown'); await tap('ArrowDown'); await page.waitForTimeout(200)
    await tap()
    const asked = await pushUntilMenu('예 아니오', 20)
    await tap('ArrowUp'); await tap()
    note('포기한다', `목록 ${String(listed)} · 물음 ${String(asked)}`)
    break
  }
  const ended = await pushUntilQuiet()
  s = ended.s
  out.talk = (await talkLog.take(page)).slice(-6)
  out.end = s
  note('도전이 닫혔다', `${String(ended.ok)} · 맵 ${String(s.map)} · 표식 ${String(s.load)} · 기록 ${JSON.stringify(s.record)} · BP ${String(s.bp)}`)
  /**
   * ⚠️ **접수원 앞에서 물러난다.** 칸 끝의 리포트 쓰기는 Space를 여러 번 누르는데, 접수원을 보고 선 채면 그 누름이 말 걸기가 되어
   * **새 도전이 열린다**(16567 → 0xFF · 「저장하고 시작」). 그 상태로 리포트가 써지면 이어할 때 원작대로 「저장 안 하고 껐다 · 도전 무효」가 뜬다
   * (실측 2026-10-17 · 칸 19 ⑭ 45초 — 닫힌 뒤 스크립트가 16567을 255 → 0 → 255로 적었다)
   */
  const away = await api.stepOn(FRONTIER.factory, { x: FACTORY_DESK.x, z: FACTORY_DESK.z + 2 }, Math.min(60_000, api.left()))
  note('접수원에게서 물러남', `${String(away)} · 표식 ${String((await factoryState(page)).load)}`)
  out.ok = ended.ok && s.map === FRONTIER.factory && s.load === 0 && s.record?.active === false && out.battles.length > 0 && out.battles[0].closed
  lastFactory = out
  return done()
}
/** 도착 판정이 읽는 이 판의 결말 — 배틀을 치렀는가는 걸음만 안다 */
let lastFactory = null

export const reachedFactory = async (page) => {
  const s = await factoryState(page)
  return lastFactory?.ok === true && s.map === FRONTIER.factory && s.load === 0 && s.record?.active === false
}

// ── r 사천왕 재대결 ─────────────────────────────────────────────────────────

/**
 * **다리 r — 사천왕 재대결.** 214 `FLAG_ARRESTED_CHARON_STARK_MOUNTAIN`이 서면 방마다 `_REMATCH` 트레이너다
 * (`scripts_pokemon_league_aaron_room.s:18-19` · `_champion_room.s:22-23` — 깃발 하나가 유일한 스위치). 걸음은 칸 16의
 * `badgesLeague.eliteFour` 그대로(북 센터 → 문지기 → 승강기 · 방 넷 → 난천 → 전당)이고, 그 뒤 타이틀 「이어하기」로 다시 든다.
 * 도착 판정: 전당 기록이 하나 늘었다 · 상대 첫 트레이너가 재대결 번호(충호 866 — `_pg42` rematch 실측)
 */
const AARON_REMATCH = 866
let lastRematch = null
const hofTotal = (page) => page.evaluate(async () => {
  const h = (await import('/src/state/saveStore.ts')).useSaveStore.getState().hallOfFame
  return h === undefined || h === null ? 0 : (h.total ?? h.entries?.length ?? 0)
}).catch(() => null)

export async function eliteRematch(api, ctx, page) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; lastRematch = out; return out }
  const v = (await api.storyVars()) ?? {}
  const charon = (await varsFlags(page, [], [214]))?.f214 === true
  out.hofBefore = await hofTotal(page)
  note('처음', `214 ${String(charon)} · 사천왕 깃발 ${JSON.stringify([v.aaron, v.bertha, v.flint, v.lucian, v.cynthia])} · 전당 ${String(out.hofBefore)}`)
  if (!charon) { note('재대결 조건', '214가 안 섰다 — 칸 20(플루토 체포)이 먼저다'); return done() }
  if ([STARK.room1, STARK.room2, STARK.room3].includes((await api.now()).map)) note('하드마운틴에서 나온다', String(await leaveStark(api, ctx, page, note)))
  const fly = await api.flyTo(LEAGUE_MAP.league, Math.min(180_000, api.left()))
  note('공중날기 → 포켓몬리그', fly.ok ? '닿았다' : String(fly.why))
  /**
   * 리그 날기 자리는 남쪽이다 — 북 센터는 챔피언로드 너머다. 실측(진단 2판): `goTo(175)`가 리그(172) ↔ 챔피언로드 1F(244)를 3분 오가 섰다.
   * 남 센터에서 회복하고 칸 15의 걸음(`badgesLeague.victoryRoad` — 층마다 문 · 2F 바위 풀이)을 그대로 탄다. 라이벌전은 이미 끝나 건너뛴다
   */
  const heal = await api.healAt(LEAGUE_MAP.leagueSouthCenter, Math.min(300_000, api.left()))
  note('리그 남 센터 회복', heal.ok ? '나았다' : String(heal.why))
  const road = await victoryRoad(api, ctx)
  note('챔피언로드 → 리그 북 센터', `${String((await api.now()).map)} · ${JSON.stringify(road.steps?.slice(-3) ?? null).slice(0, 300)}`)
  if ((await api.now()).map !== LEAGUE_MAP.leagueNorthCenter) return done()
  // 상대 트레이너 번호를 배틀마다 적는다 (읽기만 — `useBattleStore.foes`)
  const foes = []
  const watch = setInterval(() => {
    page.evaluate(async () => (await import('/src/state/battleStore.ts')).useBattleStore.getState().foes.map((t) => t.id))
      .then((ids) => { for (const id of ids) if (!foes.includes(id)) foes.push(id) }).catch(() => {})
  }, 1500)
  /**
   * 재대결 팀은 L60대 후반~L70대(난천 재대결 선두 L77대)다 — 칸 16 끝 파티(L97 · 87 · 87 · 기라티나 75)로는 진단 3판에서 오엽까지 가서
   * 선두 셋이 다 쓰러졌다. 사탕으로 맞춘다(정상 행동 · `journey-levels-by-candy`)
   */
  const r = await eliteFour(api, ctx, page, { rematch: true, levels: { lead: 100, bird: 100, third: 100, giratina: 100 } })
  clearInterval(watch)
  out.league = { ok: r?.ok, rooms: r?.rooms, ending: r?.ending, navigated: r?.navigated }
  out.foes = foes
  note('사천왕 · 난천', `${JSON.stringify(out.league).slice(0, 400)} · 상대 ${JSON.stringify(foes)}`)
  if (r?.ok !== true) return done()
  // 타이틀에서 이어하기 — 칸 16 다리 m과 같은 길
  const cont = page.getByRole('button', { name: '이어하기', exact: true })
  await cont.waitFor({ timeout: 120_000 })
  await cont.click()
  await page.waitForFunction(() => location.pathname === '/play', null, { timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.renderer === 'live'
    && document.documentElement.dataset.restoring === undefined && document.documentElement.dataset.map !== undefined, null, { timeout: 180_000 })
  await api.settle()
  out.hofAfter = await hofTotal(page)
  note('이어하기', `맵 ${String((await api.now()).map)} · 전당 ${String(out.hofBefore)} → ${String(out.hofAfter)}`)
  out.ok = foes.includes(AARON_REMATCH) && (out.hofAfter ?? 0) > (out.hofBefore ?? 0)
  return done()
}

export const reachedRematch = async (page) => lastRematch?.ok === true && (await hofTotal(page)) === lastRematch.hofAfter

// ── s 선단신전과 레지기가스 ─────────────────────────────────────────────────

/**
 * 선단신전 1F 278 → B1F 279 → B2F 280 → B3F 281 → B4F 282 → B5F 283. 선단시티 좌표 사건 (366,198) 16511 `VAR_SNOWPOINT_CITY_STATE`
 * 0 → 1(전국도감 · 전당이면 문지기가 비키고 무청이 들어온다) · 문 (366/367,197). B5F 레지기가스 (11,12) 스크립트 2 — 숨김 579는
 * 전당 스크립트가 전국도감이면 푼다(`scripts_pokemon_league_hall_of_fame.s:129,164-169`). A → 셋이 다 있으면 282 `FLAG_AWAKENED_REGIGIGAS` ·
 * `StartLegendaryBattle 486 Lv1` · 잡으면 283
 */
export const TEMPLE = { snowpoint: 165, snowpointCenter: 168, f1: 278, b5: 283 }
const SNOWPOINT_STATE = 16511
const REGI = { awakened: 282, caught: 283 }
const REGIGIGAS_SCRIPT = 2
/** B5F 얼음 — 계단 (8,4)에서 레지기가스 앞 (11,13)까지 (진단 탐침 `_pg42 temple`이 격자로 찾고 실측한 길). 미끄러짐이 멈춘 칸을 맞대며 간다 */
const B5F_SLIDE = [['ArrowLeft', 7, 4], ['ArrowDown', 7, 17], ['ArrowDown', 7, 18], ['ArrowRight', 16, 18], ['ArrowUp', 16, 10],
  ['ArrowLeft', 4, 10], ['ArrowDown', 4, 16], ['ArrowRight', 11, 16], ['ArrowUp', 11, 15], ['ArrowUp', 11, 14], ['ArrowUp', 11, 13]]

/** 신전 층마다 올라가는 계단 (`events.json` 워프) — 1F는 선단시티로 나가는 문 (8,13) */
const TEMPLE_UP = { 283: { x: 8, z: 3 }, 282: { x: 6, z: 3 }, 281: { x: 6, z: 3 }, 280: { x: 6, z: 3 }, 279: { x: 4, z: 3 }, 278: { x: 8, z: 13 } }
/**
 * **선단신전에서 걸어 나온다** — 동굴 안이라 공중날기가 안 되고(실측 칸 23 진단 1판: B4F ↔ B3F를 3분 오가다 섰다) 얼음 층은 공용 길잡이가
 * 못 오른다. 층마다 길잡이로 위층에 가 보고, 못 가면 얼음 풀이로 올라가는 계단 옆까지 미끄러져 계단을 민다
 */
export async function leaveTemple(api, ctx, note) {
  for (let i = 0; i < 8; i++) {
    const here = (await api.now()).map
    const up = TEMPLE_UP[here]
    if (up === undefined) return true
    const next = here === TEMPLE.f1 ? TEMPLE.snowpoint : here - 1
    /**
     * 얼음 풀이를 **먼저** 한다 — 길잡이를 먼저 부르면 얼음 층(B3F)에서 아래층 계단으로 미끄러져 내려가 두 층 사이를 3분 오가다 선다
     * (진단 2판: 281 → 282 → 281…). 풀이가 없으면(얼음이 없는 층) 길잡이로 간다
     */
    let went = ''
    const side = up.z === 13 ? [[up.x, up.z - 1]] : [[up.x, up.z + 1]]
    const slid = await snowpointSlide(api, ctx, { goals: side, what: `맵 ${String(here)} 올라가는 계단 앞` })
    if (slid.ok) went = await boardWarp(api, here, up, Math.min(300_000, api.left()))
    if ((await api.now()).map === here) went = await api.goTo(next, Math.min(240_000, api.left()))
    note(`신전에서 나온다 — 맵 ${String(here)} → ${String(next)}`, went)
    if ((await api.now()).map === here) return false
  }
  return !Object.keys(TEMPLE_UP).map(Number).includes((await api.now()).map)
}

let lastRegi = null
export async function templeRegigigas(api, ctx, page) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; lastRegi = out; return out }
  const party = async () => ((await api.partyState()) ?? []).map((m) => m.species)
  const read = async () => {
    const r = await varsFlags(page, [SNOWPOINT_STATE], [REGI.awakened, REGI.caught, 579])
    return { snowpoint: r?.[`v${String(SNOWPOINT_STATE)}`], awakened: r?.[`f${String(REGI.awakened)}`], caught: r?.[`f${String(REGI.caught)}`], hidden: r?.f579 }
  }
  let v = await read()
  note('처음', `${JSON.stringify(v)} · 파티 ${JSON.stringify(await party())}`)
  const trio = [377, 378, 379]
  {
    const has = await party()
    if (!trio.every((n) => has.includes(n))) {
      if (!ctx.shortcuts.includes('regi-trio')) {
        out.blocked = '파티에 레지락 · 레지아이스 · 레지스틸이 없다 — 원작에서 셋은 배포 레지기가스로만 열리는 유적에 있다(scrcmd.c:7113) · --shortcut=regi-trio'
        note('레지 셋', out.blocked)
        return done()
      }
      out.shortcut = await page.evaluate(async (want) => {
        const save = (await import('/src/state/saveStore.ts')).useSaveStore
        const gd = await import('/src/data/gameData.ts')
        const inst = await import('/src/engine/pokemon/instance.ts')
        const [species, moves] = await Promise.all([gd.loadSpecies(), gd.loadMoves()])
        const pp = (id) => moves.byId?.get?.(id)?.pp ?? moves.get?.(id)?.pp ?? 5
        const st = save.getState()
        const sent = []
        const missing = want.filter((n) => !st.party.some((m) => m.species === n))
        while (save.getState().party.length + missing.length > 6) {
          const i = save.getState().party.findIndex((m) => m.species === 487)
          const at = i < 0 ? save.getState().party.length - 1 : i
          sent.push(save.getState().party[at].species)
          if (save.getState().depositMon(at) === null) return { why: '상자에 못 넣었다' }
        }
        for (const n of missing) {
          const sp = species.get(n)
          const mon = inst.fillPp(inst.createWild({ species: sp, level: 30, rng: Math.random, otId: st.trainer.id, otSecretId: st.trainer.secretId }), pp)
          save.getState().addToParty({ ...mon, hp: inst.statsOf(mon, sp).hp })
        }
        return { added: missing, deposited: sent }
      }, trio)
      note('지름길 regi-trio', `${JSON.stringify(out.shortcut)} → 파티 ${JSON.stringify(await party())}`)
    }
  }

  // 이미 신전 안이면(앞 판이 거기서 멈췄다) 거기서 잇는다
  const inTemple = [TEMPLE.f1, 279, 280, 281, 282, TEMPLE.b5].includes((await api.now()).map)
  if (!v.awakened && !inTemple) {
    const fly = await api.flyTo(TEMPLE.snowpoint, Math.min(180_000, api.left()))
    note('공중날기 → 선단시티', fly.ok ? '닿았다' : String(fly.why))
    const heal = await api.healAt(TEMPLE.snowpointCenter, Math.min(300_000, api.left()))
    note('선단 센터 회복', heal.ok ? '나았다' : String(heal.why))
  }
  if (!v.awakened) {
    if ((v.snowpoint ?? 0) < 1 && !inTemple) {
      await talkLog.start(page)
      // ⚠️ `stepOn`은 다른 맵에서 부르면 첫 바퀴에 「warped」로 돌아온다 — 센터에서 회복한 뒤라 먼저 선단시티로 나간다 (진단 1판)
      await api.goTo(TEMPLE.snowpoint, Math.min(300_000, api.left()))
      const went = await api.stepOn(TEMPLE.snowpoint, { x: 366, z: 198 }, Math.min(300_000, api.left()))
      await until(api, async () => ((await read()).snowpoint ?? 0) >= 1, 120_000)
      v = await read()
      note('신전 앞 (366,198) — 무청', `${went} · 상태 ${String(v.snowpoint)} · ${JSON.stringify((await talkLog.take(page)).slice(-3))}`)
      if ((v.snowpoint ?? 0) < 1) return done()
    }
    /**
     * ⚠️ **B2F 아래는 얼음 바닥이다** — 공용 길잡이는 미끄럼을 몰라 진단 2판에서 B2F(280)를 393번 나아가고도 계단에 못 닿았다.
     * 길잡이가 못 가면 선단 체육관의 얼음 풀이(`badges67.snowpointSlide` — 제품의 얼음 규칙으로 푸는 `observe.snowpointPlan`)로
     * 다음 층 계단 (14,3) 아래 칸까지 미끄러진 뒤 계단을 민다
     */
    const floors = [TEMPLE.f1, 279, 280, 281, 282, TEMPLE.b5]
    const startAt = floors.indexOf((await api.now()).map)
    for (const m of floors.slice(startAt + 1)) {
      let went = await api.goTo(m, Math.min(300_000, api.left()))
      const here = (await api.now()).map
      if (went !== 'arrived' && floors.includes(here) && floors.indexOf(here) === floors.indexOf(m) - 1) {
        const slid = await snowpointSlide(api, ctx, { goals: [[14, 4], [13, 3], [15, 3]], what: `맵 ${String(here)} 계단 앞` })
        note(`신전 — 맵 ${String(here)} 얼음`, JSON.stringify({ ok: slid.ok, why: slid.why, moves: slid.moves?.length }))
        if (slid.ok) went = await boardWarp(api, here, { x: 14, z: 3 }, Math.min(300_000, api.left()))
      }
      note(`신전 — 맵 ${String(m)}`, went)
      if (went !== 'arrived') return done()
    }
    // B5F 얼음 — 계단에서 레지기가스 앞까지 미끄러진다. 멈춘 칸이 다르면 적고 그만둔다
    let at0 = await api.now()
    // 계단 (8,3)에 내려서면 한 칸 아래 (8,4)가 미끄럼 길의 출발이다(진단 탐침이 선 자리)
    if (at0.x === 8 && at0.z === 3) { await api.stepKey('ArrowDown', { x: 8, z: 4 }); at0 = await api.now() }
    note('B5F 들어선 자리', `${String(at0.x)},${String(at0.z)}`)
    for (const [key, wx, wz] of B5F_SLIDE) {
      const from = await api.now()
      await page.keyboard.down(key)
      for (let i = 0; i < 30; i++) { await page.waitForTimeout(40); const p = await api.now(); if (p.x !== from.x || p.z !== from.z) break }
      await page.keyboard.up(key)
      let last = ''; let same = 0
      for (let i = 0; i < 80 && same < 6; i++) {
        await page.waitForTimeout(120)
        const p = await api.now(); const k = `${String(p.x)},${String(p.z)}`
        same = k === last ? same + 1 : 0; last = k
      }
      if (last !== `${String(wx)},${String(wz)}`) { note('B5F 얼음', `${key} 뒤 ${last} — 기대 ${String(wx)},${String(wz)}`); return done() }
    }
    note('B5F 얼음', '레지기가스 앞 (11,13)에 섰다')
    const foe = []
    const watch = setInterval(() => {
      page.evaluate(async () => Object.values((await import('/src/state/battleStore.ts')).useBattleStore.getState().view?.active ?? {})
        .map((m) => `${String(m?.species)} L${String(m?.level)}`)).then((x) => { for (const one of x) if (!foe.includes(one)) foe.push(one) }).catch(() => {})
    }, 1000)
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(60); await page.keyboard.up('ArrowUp')
    await page.waitForTimeout(300)
    await talkLog.start(page)
    await page.keyboard.down('Space'); await page.waitForTimeout(70); await page.keyboard.up('Space')
    // 대사를 넘겨 배틀이 열리면 볼을 던진다(L1 — 잡는 것이 정상 행동이다)
    let thrown = null
    for (const till = Date.now() + 120_000; Date.now() < till;) {
      const n = await api.now()
      if (n.scene === 'battle') { thrown = await api.throwBalls(Math.min(180_000, api.left()), 4); break }
      if (n.talk) await api.tap('Space', 300)
      else await page.waitForTimeout(400)
      if ((await read()).awakened && n.scene !== 'battle' && !n.talk && !n.script) break
    }
    await api.settle()
    clearInterval(watch)
    v = await read()
    out.battle = foe
    out.thrown = thrown
    note('레지기가스 (11,12)', `배틀에 선 것 ${JSON.stringify(foe)} · 볼 ${JSON.stringify(thrown)?.slice(0, 200)} · ${JSON.stringify(v)} · ${JSON.stringify((await talkLog.take(page)).slice(-4))}`)
  }
  // 칸 경계를 신전 밖(선단시티)에 둔다 — 다음 칸은 공중날기로 시작한다
  if (v.awakened === true) note('선단신전에서 나온다', String(await leaveTemple(api, ctx, note)))
  out.ok = v.awakened === true
  return done()
}

export const reachedRegigigas = async (page) => ((await varsFlags(page, [], [REGI.awakened]))?.[`f${String(REGI.awakened)}`] === true)

// ── t 로토무 ────────────────────────────────────────────────────────────────

/**
 * 숲의 양옥집 295 → 복도 298 (11,2) → 뒤 가운데 서쪽 방 300. TV 표지판 (11,3) · (12,3) — (11,4)에서 북쪽을 보고 A.
 * 밤(20~03시) · 329 `FLAG_CAUGHT_OLD_CHATEAU_ROTOM` 아님 · 2736 오늘 싸움 아님 → `StartWildBattle 479 Lv20`. 전국도감은 안 본다.
 * 도착 판정: 2736(오늘 싸웠다) 또는 329(잡았다)
 */
export const CHATEAU = { hall: 295, corridor: 298, room: 300 }
const ROTOM = { battled: 2736, caught: 329 }
let lastRotom = null
export async function chateauRotom(api, ctx, page) {
  const t0 = Date.now()
  const out = { steps: [] }
  const note = noteOf(out, ctx)
  const done = () => { out.ms = Date.now() - t0; lastRotom = out; return out }
  const read = async () => {
    const r = await varsFlags(page, [], [ROTOM.battled, ROTOM.caught])
    return { battled: r?.[`f${String(ROTOM.battled)}`], caught: r?.[`f${String(ROTOM.caught)}`] }
  }
  const hour = () => page.evaluate(async () => (await import('/src/state/worldState.ts')).worldState.time.gameHour).catch(() => null)
  let v = await read()
  note('처음', `${JSON.stringify(v)} · 시각 ${String(await hour())}`)
  if (TEMPLE_UP[(await api.now()).map] !== undefined) note('선단신전에서 나온다', String(await leaveTemple(api, ctx, note)))
  const fly = await api.flyTo(65, Math.min(180_000, api.left()))
  note('공중날기 → 영원시티', fly.ok ? '닿았다' : String(fly.why))
  const heal = await api.healAt(69, Math.min(300_000, api.left()))
  note('영원 센터 회복', heal.ok ? '나았다' : String(heal.why))
  /**
   * ⚠️ **숲의 양옥집 문 (74,15)은 영원의숲(203) 안 거합베기 나무 셋((74,33) · (75,33) · (77,33)) 너머다** — 나무를 피하면 정적 격자로도
   * 「unreachable」(2026-10-16 계산). 칸 21 끝 파티(토대부기 · 찌르호크 · 비버통 · 레지 셋)에 거합베기가 없다 — 비전머신01(420)을
   * 토대부기에게 가르친다(잎날가르기(75)를 잊는다 · `badges67.teachTo`). 나무는 `clearWay`가 가까운 것부터 벤다
   */
  const party = (await api.partyState()) ?? []
  if (!party.some((m) => m.moves.some((x) => x.move === 15))) {
    const taught = await teachTo(api, 420, 15, [387, 388, 389], { keep: [89, 202, 431] })
    note('비전머신01 거합베기', JSON.stringify(taught).slice(0, 200))
  }
  const forest = await api.goTo(203, Math.min(900_000, api.left()))
  note('영원의숲(203)', forest)
  let hall = await api.goTo(CHATEAU.hall, Math.min(300_000, api.left()))
  if (hall !== 'arrived' && (await api.now()).map === 203) {
    const cut = await api.clearWay(203, CHATEAU.hall, Math.min(900_000, api.left()), { sprite: 86, maxHits: 3 })
    hall = cut.ok ? 'arrived' : JSON.stringify(cut).slice(0, 200)
  }
  note('숲의 양옥집(295)', hall)
  const room = await api.goTo(CHATEAU.room, Math.min(900_000, api.left()))
  note('숲의 양옥집 — 뒤 방(300)', room)
  if (room !== 'arrived') return done()
  const h = await hour()
  const night = h !== null && (h >= 20 || h < 4)
  if (!night) {
    if (!ctx.shortcuts.includes('night')) {
      out.blocked = `지금 게임 시각 ${String(h)}시 — 로토무는 밤(20~03시)에만 나온다 · --shortcut=night`
      note('시각', out.blocked)
      return done()
    }
    await page.evaluate(async () => { (await import('/src/state/worldState.ts')).worldState.time.gameHour = 21 })
    out.shortcut = { name: 'night', from: h, to: 21 }
    note('지름길 night', `${String(h)}시 → ${String(await hour())}시`)
  }
  const stood = await api.stepOn(CHATEAU.room, { x: 11, z: 4 }, Math.min(300_000, api.left()))
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(60); await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(300)
  const foe = []
  const watch = setInterval(() => {
    page.evaluate(async () => Object.values((await import('/src/state/battleStore.ts')).useBattleStore.getState().view?.active ?? {})
      .map((m) => `${String(m?.species)} L${String(m?.level)}`)).then((x) => { for (const one of x) if (!foe.includes(one)) foe.push(one) }).catch(() => {})
  }, 1000)
  await talkLog.start(page)
  await page.keyboard.down('Space'); await page.waitForTimeout(70); await page.keyboard.up('Space')
  let thrown = null
  for (const till = Date.now() + 120_000; Date.now() < till;) {
    const n = await api.now()
    if (n.scene === 'battle') { thrown = await api.throwBalls(Math.min(240_000, api.left()), 8); break }
    if (n.talk) await api.tap('Space', 300)
    else await page.waitForTimeout(400)
    const r = await read()
    if ((r.battled || r.caught) && !n.talk && n.scene !== 'battle') break
  }
  await api.settle()
  clearInterval(watch)
  v = await read()
  out.battle = foe
  out.thrown = thrown
  note('TV (11,3)', `${stood} · 배틀에 선 것 ${JSON.stringify(foe)} · 볼 ${JSON.stringify(thrown)?.slice(0, 200)} · ${JSON.stringify(v)} · ${JSON.stringify((await talkLog.take(page)).slice(-4))}`)
  out.ok = v.battled === true || v.caught === true
  return done()
}

export const reachedRotom = async (page) => {
  const r = await varsFlags(page, [], [ROTOM.battled, ROTOM.caught])
  return r?.[`f${String(ROTOM.battled)}`] === true || r?.[`f${String(ROTOM.caught)}`] === true
}
