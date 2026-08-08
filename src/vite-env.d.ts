/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 에셋 CDN 뿌리 (COPYRIGHT.md §6). 없으면 앱 셸과 같은 자리를 쓴다.
   *
   * 빌드 때 값이 박히므로 버킷을 바꾸려면 재배포해야 한다. 대신 코드에는 주소가
   * 한 글자도 안 들어간다 — 채널이 죽어도 코드는 그대로 산다는 것이 §6의 요지다
   */
  readonly VITE_ASSET_BASE?: string
}
