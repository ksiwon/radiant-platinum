// 이름 짓기 화면이 낸 답 (`OpenPokemonNamingScreen`)
//
// ⚠️ **여기는 아무것도 안 부른다.** 화면(`NameScreen.tsx`)에 두면 스크립트를
// 잇는 쪽(`scene/fieldServices`)이 React 컴포넌트를 통째로 들여오게 된다 —
// 타이틀의 곡 번호를 잎 모듈로 뺀 것과 같은 이유다 (`audio/songIds`).
//
// 스토어가 아니라 그냥 칸인 이유: 스크립트는 **화면이 닫힌 뒤에** 답을 묻는데,
// 스토어에 두면 닫는 순간 비워진다. 배틀 결과를 붙잡아 두는 것과 같다
export const naming = {
  answer: null as { name: string; slot: number } | null,
}
