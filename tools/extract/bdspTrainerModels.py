"""플래티넘 트레이너 갈래 → BDSP 인물 번들 (DATA.md §2.16).

    py -3.13 tools/extract/bdspTrainerModels.py          src/import/bdsp/trainerModels.ts를 다시 만든다
    py -3.13 tools/extract/bdspTrainerModels.py --check   갱신이 필요한지만 본다

⚠️ **이름이 비슷하다고 잇지 않는다.** 한동안 그렇게 했고, 그래서 눈 지방
엘리트 트레이너가 평지 엘리트 트레이너로 서고 무쇠(트우간)와 스즈나가 서로
바뀌어 있었다. BDSP는 **자기가 어느 몸을 쓰는지 적어 둔다**:

    Dpr/masterdatas  TrainerTable.TrainerType[].ModelID   → `tr1074_00`
                     TrainerTable.TrainerType[].LabelTrType
    Message/english  DP_Trainers_Type_*                   → "Gym Leader"
                     DP_Trainers_Name_*                   → "Gardenia"

플래티넘 쪽 갈래 차례는 `generated/trainer_classes.txt`다. 두 차례는 **같은 게임
자료에서 나온 같은 순서**라, BDSP가 짝으로 다니는 사람을 두 줄로 나눠 적은
자리(쌍둥이·러브러브·더블팀·목장부부·취재진)만 한 줄로 접으면 1:1로 맞는다.

그래도 접은 뒤 "그러니까 맞다"고 하지 않는다. 줄마다 근거를 요구한다:

  ① **갈래 이름이 같다** — "Youngster" ↔ YOUNGSTER
  ② **사람 이름이 같다** — 그 갈래에 딱 한 사람만 있고 그 이름이 플래티넘
     갈래 이름에 들어 있다 ("Gardenia" ↔ LEADER_GARDENIA)
  ③ **양쪽이 못 박혀 있다** — ①②로 확인된 줄 사이에 낀 줄. 차례가 같은
     자료이므로 앞뒤가 고정되면 가운데도 밀릴 자리가 없다

셋 다 못 대면 **적지 않는다.** 배틀타워 쪽(메이드·홀 마돈나·팩토리헤드…)이
그렇게 떨어져 나간다 — BDSP에는 프론티어가 없으니 맞는 결과다.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import UnityPy

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.raw.sources import require_dir  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src/import/bdsp/trainerModels.ts"
CLASSES = require_dir("references.decomp") / "generated/trainer_classes.txt"


def mono(bundle: Path, name: str):
    """번들에서 이름이 맞는 MonoBehaviour의 타입 트리"""
    env = UnityPy.load(str(bundle))
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        if obj.read().m_Name != name:
            continue
        return obj.read_typetree()
    raise SystemExit(f"{bundle.name}에 {name}이 없다")


def messages(bundle: Path, name: str) -> dict[str, str]:
    tree = mono(bundle, name)
    return {
        row["labelName"]: "".join(w["str"] for w in row["wordDataArray"])
        for row in tree["labelDataArray"]
    }


def norm(text: str) -> str:
    """견줄 꼴 — 글자만 남긴다. `Poké Fan` → `pokfan`"""
    return re.sub(r"[^a-z]", "", text.lower())


#: 성별 꼬리. 플래티넘은 갈래 이름에 붙이고 BDSP는 `Sex` 칸에 둔다
GENDER_TAIL = ("male", "female", "m", "f")


def person_key(plat: str) -> str:
    """같은 사람의 다른 갈래 번호를 한 열쇠로. `DP_PLAYER_MALE_2` → `playermale`"""
    return norm(re.sub(r"^DP_|_2$", "", plat))


def same_role(plat: str, bdsp_en: str) -> bool:
    """① 갈래 이름이 같은가. 성별 꼬리는 떼고 본다"""
    if not bdsp_en:
        return False
    want, got = norm(plat), norm(bdsp_en)
    if want == got:
        return True
    return any(want == got + tail for tail in GENDER_TAIL)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="다시 만들지 않고 어긋남만 알린다")
    args = ap.parse_args()

    master = require_dir("bdsp.masterdatas")
    message = require_dir("bdsp.message") / "english"
    persons = require_dir("bdsp.characters") / "persons"

    table = mono(master, "TrainerTable")
    role_text = messages(message, "english_dp_trainers_type")
    name_text = messages(message, "english_dp_trainers_name")

    #: 갈래 번호 → 그 갈래로 싸우는 사람 이름들
    people: dict[int, set[str]] = {}
    for row in table["TrainerData"]:
        if row["TypeID"] < 0:
            continue
        who = name_text.get(row["NameLabel"], "")
        if who:
            people.setdefault(row["TypeID"], set()).add(who)

    #: BDSP 갈래. 짝으로 다니는 사람은 두 줄이라 **연달아 같은 라벨을 접는다**
    types: list[dict] = []
    for row in table["TrainerType"]:
        label = row["LabelTrType"]
        if types and label and types[-1]["label"] == label:
            continue
        types.append({
            "id": row["TrainerID"], "label": label, "model": row["ModelID"],
            "sex": row["Sex"], "en": role_text.get(label, ""),
        })

    classes = [
        line.replace("TRAINER_CLASS_", "")
        for line in CLASSES.read_text(encoding="utf-8").split()
        if line
    ]

    # ①② 로 확인되는 줄부터 표시한다
    pairs: list[dict | None] = []
    for i, plat in enumerate(classes):
        if i >= len(types):
            pairs.append(None)
            continue
        bdsp = types[i]
        via = None
        if same_role(plat, bdsp["en"]):
            via = bdsp["en"]
        else:
            named = people.get(bdsp["id"], set())
            if len(named) == 1:
                only = next(iter(named))
                if norm(only) in {norm(tok) for tok in plat.split("_")}:
                    via = only
        pairs.append({"plat": plat, "bdsp": bdsp, "via": via})

    # ⚠️ **BDSP가 안 쓰는 갈래는 아무 몸이나 가리킨다.** `TR_ANEOTOUTO_01`
    # (누나와 남동생)이 그렇다 — 그 갈래로 싸우는 사람이 하나도 없고 글자도
    # 안 붙어 있는데 `ModelID`에는 `tr2018_00`이 적혀 있다. 그 번들을 열면
    # **자스민**이다. 차례로 못 박아 봐야 자스민이 서므로 여기서 끊는다
    for pair in pairs:
        if pair and not pair["bdsp"]["en"] and not people.get(pair["bdsp"]["id"]):
            pair["stub"] = True

    # ③ 확인된 줄 **둘 사이에** 낀 것은 차례가 못 박아 준다
    anchors = [i for i, p in enumerate(pairs) if p and p["via"]]
    if len(anchors) < 40:
        raise SystemExit(f"차례가 안 맞는다 — 이름으로 확인된 줄이 {len(anchors)}개뿐이다")
    for lo, hi in zip(anchors, anchors[1:]):
        low, high = pairs[lo], pairs[hi]
        assert low is not None and high is not None
        for i in range(lo + 1, hi):
            pair = pairs[i]
            if pair is not None and not pair.get("stub"):
                pair["via"] = f"{low['plat']}~{high['plat']} 사이"

    # ④ 같은 사람의 다른 갈래 번호. 주인공 둘이 갈래 셋씩(플래티넘·DP·DP2) 있다
    same_person = {}
    for i, pair in enumerate(pairs):
        if pair and pair["via"]:
            same_person.setdefault(person_key(pair["plat"]), i)
    for i, plat in enumerate(classes):
        pair = pairs[i]
        if pair is not None and pair["via"]:
            continue
        twin = pairs[same_person.get(person_key(plat), -1)] if person_key(plat) in same_person else None
        if twin is None:
            continue
        pairs[i] = {"plat": plat, "bdsp": twin["bdsp"], "via": twin["plat"]}

    rows = []
    dropped = []
    for i, pair in enumerate(pairs):
        if pair is None or not pair["via"]:
            dropped.append(classes[i] if i < len(classes) else "?")
            continue
        model = pair["bdsp"]["model"]
        # 주인공 둘은 옷 번호 없이 `pc0001`로 적혀 있다 — 기본 옷이 `_00`이다
        if not (persons / "battle" / model).is_file():
            model = f"{model}_00"
        rows.append((i, model, pair["bdsp"]["sex"], pair["via"]))

    have = {p.name for p in (persons / "battle").iterdir() if p.is_file()}
    missing = sorted({m for _, m, _, _ in rows if m not in have})

    body = "\n".join(
        f'  [{cls}, {model!r}, {sex}, {via!r}],'.replace("'", '"')
        for cls, model, sex, via in rows
    )
    text = HEADER + body + "\n]\n"

    print(f"갈래 {len(classes)} 중 짝이 선 것 {len(rows)} · 못 댄 것 {len(dropped)}: "
          f"{' '.join(dropped)}")
    if missing:
        print(f"⚠ 번들이 덤프에 없다: {' '.join(missing)}")

    if args.check:
        now = OUT.read_text(encoding="utf-8") if OUT.is_file() else ""
        if now != text:
            raise SystemExit(f"{OUT.relative_to(ROOT)}가 낡았다 — 인자 없이 다시 돌린다")
        print("표가 최신이다")
        return
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"→ {OUT.relative_to(ROOT)}")


HEADER = '''// 플래티넘 트레이너 갈래 → BDSP 인물 번들 (DATA.md §2.16)
//
// ⚠️ **손으로 고치지 않는다.** `pnpm gen:trainerModels`가 BDSP 덤프에서 다시
// 만든다 (`tools/extract/bdspTrainerModels.py`). 그 도구가 줄마다 근거를 요구하고,
// 근거를 못 대는 줄은 아예 안 적는다 — 마지막 칸이 그 근거다.
//
// 네 번째 칸이 "A~B 사이"면 **차례로 못 박힌 자리**라는 뜻이다. 두 자료의 갈래
// 차례가 같은 원본에서 나왔으므로, 앞뒤가 이름으로 확인되면 가운데는 밀릴 곳이
// 없다. 그렇게라도 못 대는 줄(프론티어 쪽)은 여기 없다.
//
// **표지 게임 자료가 아니다** — 갈래 번호와 번들 이름표뿐이다 (COPYRIGHT.md §2).

/** `[플래티넘 갈래 번호, BDSP 번들, 0=남 1=여 2=둘, 짝을 확인해 준 근거]` */
type TrainerModelRow = readonly [number, string, number, string]

export const TRAINER_MODELS: readonly TrainerModelRow[] = [
'''


if __name__ == "__main__":
    main()
