// 컷신이 **맞게** 도는가 — 누가 말하고 몇 쪽이 지나갔나 (REPAIR §9의 ①·②)
//
// `story.mjs`도 `run.mjs`도 지금까지 **안 멈추는 것**만 쟀다. 지문이 바뀌는지와
// 누름 수만 세므로 엉뚱한 사람이 서 있거나 대사가 통째로 건너뛰어도 통과한다.
// 여기서 그 둘을 잰다.
//
// ⚠️ **롬 글자는 한 자도 안 담는다** (COPYRIGHT.md §6). 담는 것은 **수**뿐이다 —
// 그림 번호, 뱅크 번호, 쪽 수. 글은 세는 데만 쓰고 곧바로 버린다.
//
//     import { installSceneWatch, readSceneWatch, takeSceneWatch } from './sceneWatch.mjs'
//     await installSceneWatch(page)            // 화면을 열자마자. 세계는 안 기다려도 된다
//     …컷신을 민다…
//     const seen = await takeSceneWatch(page)  // 읽고 0으로 되돌린다
//     const { say, trouble } = readSceneWatch(seen, sprites)

/**
 * 화면 안에 감시자를 건다. 여러 번 불러도 한 번만 걸린다.
 *
 * ⚠️ **세계는 맵마다 새로 만들어진다** (`makeWorld`). 그래서 인스턴스가 아니라
 * **프로토타입**에 건다 — 그러면 맵이 바뀌어도 안 풀린다.
 *
 * ⚠️ **세계가 설 때까지 기다렸다가 스스로 붙는다.** 타이틀에서 부르면 아직
 * 세계가 없고, 뛰어든 **뒤에** 걸면 그 자리에서 이미 도는 컷신의 첫 창들을
 * 놓친다 — 실측으로 주인공 방이 34번 누르는 컷신인데 뒤늦게 걸었을 때 잡힌
 * 창은 하나뿐이었다
 */
export async function installSceneWatch(page) {
  await page.evaluate(async () => {
    if (globalThis.__sceneWatch) return
    const f = await import('/src/engine/script/field.ts')
    const printer = await import('/src/engine/script/printer.ts')
    const npcs = await import('/src/engine/actor/npcs.ts')
    // ⚠️ **소품은 사람이 아니다.** 배치표에 사람과 같이 들어 있지만 간판 여섯·
    // 눈덩이·책·사천왕 방문·로토무 방 벽 열 종은 원작에서 **3D 오브젝트**라
    // 2D 그림표에 아예 없다 (`scene/ObjectProps` 머리말). 안 거르면 「그림이
    // 없는 사람이 섰다」가 현관 앞(91·92·94)과 갤럭시단(262)에서 헛돈다
    const props = await import('/src/import/platinum/fldeffProps.ts')

    const arm = () => {
      const state = {
        /** 롬이 적어 둔 쪽 수 / 실제로 넘어간 쪽 수 */
        pages: { expected: 0, turned: 0 },
        /** 창이 열릴 때마다 한 줄. **글자는 없다** — 번호만 */
        boxes: [],
        /** 컷신 동안 실제로 서 있던 그림 번호 전부 */
        gfx: [],
        /** 쪽 수를 세어 보는 중인가. 그동안의 `tick`은 실제 누름이 아니다 */
        counting: false,
      }
      globalThis.__sceneWatch = state

      /**
       * 이 글이 **몇 번 눌러야 끝나는가.** 인쇄기를 하나 더 만들어 끝까지 눌러
       * 본다 — 쪽 나눔 규칙(`\r` 지우기 · `\f` 밀기 · 끝)을 여기서 다시 적으면
       * 인쇄기와 갈릴 수 있으므로 **엔진의 것을 그대로 쓴다**
       */
      const pagesOf = (raw, slots) => {
        state.counting = true
        try {
          const p = new printer.MessagePrinter(raw ?? '', slots)
          let n = 0
          while (!p.finished && n < 500) { p.tick({ pressed: true, held: true }); n += 1 }
          return n
        } catch { return 0 } finally { state.counting = false }
      }

      const origTick = printer.MessagePrinter.prototype.tick
      printer.MessagePrinter.prototype.tick = function tick(input) {
        // ⚠️ **우리가 아는 창만 센다.** 감시자보다 먼저 열린 창은 롬 쪽 수에
        // 안 잡히므로, 지나간 쪽만 세면 「롬보다 많이 지나갔다」가 되어 수가
        // 뜻을 잃는다. 나머지 셋은 `tick`의 앞머리와 **같은 조건**이다 —
        // 넷이 다 맞을 때만 한 쪽이 넘어간다
        const turns = this.__watched === true && !state.counting && !this.finished
          && this.waiting !== null && input?.pressed === true
        origTick.call(this, input)
        if (turns) state.pages.turned += 1
      }

      const World = Object.getPrototypeOf(f.fieldScripts.world)

      /** 창이 열린 순간의 자리 — 누가 말하고 누가 서 있나 */
      const note = (world, msg, raw) => {
        if (world.printer) world.printer.__watched = true
        state.pages.expected += pagesOf(raw, world.slots)
        const who = world.target
        state.boxes.push({
          script: world.scriptID ?? null,
          msg,
          // `prop`이면 그림이 없는 것이 맞다 — 간판·게시판이 말을 거는 자리다
          talker: who
            ? { localID: who.localID, gfx: who.gfx, prop: props.PROP_KIND_BY_GFX.has(who.gfx) }
            : null,
        })
        for (const a of npcs.npcActors.list) {
          if (props.PROP_KIND_BY_GFX.has(a.gfx)) continue
          if (!state.gfx.includes(a.gfx)) state.gfx.push(a.gfx)
        }
      }

      const origShow = World.showMessage
      World.showMessage = function showMessage(id) {
        origShow.call(this, id)
        note(this, id, (this.override ?? this.messages)[id])
      }

      // 트레이너 대사처럼 뱅크가 아닌 데서 온 글. 뱅크 번호가 없으므로 −1로 적는다
      const origText = World.showText
      World.showText = function showText(text) {
        origText.call(this, text)
        note(this, -1, text)
      }

      // `MessageInstant` — 한 프레임에 다 찍는다. 누름이 안 들어가므로 넘긴 쪽을
      // 여기서 직접 더한다. 안 그러면 「쪽을 건너뛰었다」로 잘못 잡힌다
      const origInstant = World.showInstant
      World.showInstant = function showInstant(id) {
        const before = state.pages.expected
        origInstant.call(this, id)
        state.pages.turned += state.pages.expected - before
      }
    }

    if (f.fieldScripts.world) { arm(); return }
    // 세계가 서면 그때 붙는다. 30ms면 컷신의 첫 창(60fps로 두 프레임)보다 빠르다
    const waiting = setInterval(() => {
      if (!f.fieldScripts.world) return
      clearInterval(waiting)
      if (!globalThis.__sceneWatch) arm()
    }, 30)
  })
}

/** 지금까지 본 것을 가져오고 0으로 되돌린다. 아직 안 붙었으면 null */
export async function takeSceneWatch(page) {
  return page.evaluate(() => {
    const s = globalThis.__sceneWatch
    if (!s) return null
    const out = { pages: { ...s.pages }, boxes: s.boxes.slice(), gfx: s.gfx.slice() }
    s.pages.expected = 0
    s.pages.turned = 0
    s.boxes.length = 0
    s.gfx.length = 0
    return out
  })
}

/**
 * 본 것을 한 줄로 요약하고, 어긋난 것을 따로 돌려준다.
 *
 * @param seen `takeSceneWatch`가 준 것
 * @param sprites 그림이 실제로 있는 번호 (`public/data/npcSprites.json`의 키).
 *   null이면 그림 확인은 건너뛴다
 */
export function readSceneWatch(seen, sprites) {
  if (!seen || seen.boxes.length === 0) return { say: null, trouble: [] }
  const trouble = []
  const { expected, turned } = seen.pages

  // ② 몇 쪽인가. 롬이 적어 둔 쪽 수보다 적게 지나갔으면 **글이 통째로 날아간
  // 것**이다 — 지금까지의 누름 수는 「얼었는가」만 말했지 이걸 못 봤다
  if (turned < expected) {
    trouble.push(`대사 ${String(expected - turned)}쪽이 안 지나갔다 `
      + `(롬 ${String(expected)}쪽 · 지나간 것 ${String(turned)}쪽)`)
  }

  // ① 누가 말하는가. 컷신에 선 사람과 말을 건 상대의 그림 번호가 **실제로 있는
  // 번호인가.** 없으면 판때기가 통째로 안 서서 사람 하나가 화면에서 사라진다 —
  // 자리표시자 번호(`OBJ_EVENT_GFX_VAR_*`)를 못 푸는 것이 그 길이다.
  //
  // ⚠️ **소품은 여기 안 온다.** 간판 여섯·눈덩이·책·사천왕 방문·로토무 방 벽
  // 열 종은 원작에서 3D 오브젝트라 2D 그림표에 아예 없고(`PROP_KIND_BY_GFX`),
  // 그림이 없는 것이 **맞다.** 안 거르니 현관 앞이 91·92·94로, 갤럭시단이
  // 262로 헛돌았다 — 이 자가 처음 잡은 둘이 둘 다 그것이었다
  if (sprites !== null) {
    const missing = seen.gfx.filter((g) => !sprites.has(g))
    if (missing.length > 0) {
      trouble.push(`그림이 없는 사람이 컷신에 섰다 — 번호 ${missing.join('·')}`)
    }
    for (const box of seen.boxes) {
      if (box.talker !== null && box.talker.prop !== true && !sprites.has(box.talker.gfx)) {
        trouble.push(`말을 건 상대의 그림이 없다 — 스크립트 ${String(box.script)} `
          + `· 사람 ${String(box.talker.localID)} · 번호 ${String(box.talker.gfx)}`)
      }
    }
  }

  const who = seen.boxes.filter((b) => b.talker !== null).length
  return {
    say: `대사 ${String(seen.boxes.length)}창 ${String(turned)}/${String(expected)}쪽`
      + (who > 0 ? ` · 상대 있는 창 ${String(who)}` : '')
      + (seen.gfx.length > 0 ? ` · 선 사람 ${String(seen.gfx.length)}종` : ''),
    trouble,
  }
}
