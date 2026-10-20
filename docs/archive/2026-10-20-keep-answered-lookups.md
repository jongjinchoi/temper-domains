# 받은 조회 응답 보존(A16) + RDAP `status` 형식 방어(A3)

기준: `main @ 9d41692`. 상태: 구현·로컬 검증 완료, 커밋 전.

## 원인

- A16: `permit.answered()`(`src/checker/limits.ts`)가 상태 저장소 실패(`LimitStateError`)를 던져, 서버가 이미 답한 200/404/리다이렉트와 WHOIS 결과가 `limit_state_error`로 바뀌었다. 잠금이 더 오래 잡히면 `withAdmission`의 `finally { permit.release() }`(`src/checker/admission.ts`)도 결과를 덮었다. 재현: 응답 시점에 다른 프로세스가 `lookup-limits.json.lock`을 2.5초·5.5초 쥠 → `{"status":"error","terminationReason":"limit_state_error","httpStatus":200}`.
- A3: `parseRdapResponse`(`src/checker/rdap.ts`)가 `json.status`를 검사 없이 `statusCodes`에 넣었다. 문자열이면 TUI `WhoisView`가 Ink 오류 화면으로 종료되고, MCP `whois_domain`이 `isError`가 됐다.

## 변경

- `limits.ts` `answered()`: `LimitStateError`만 삼킨다. 그 응답의 회복 기록만 빠지고, `release()`가 연속 성공 기록을 초기화한다.
- `admission.ts`: 결과를 받은 뒤의 `release()` `LimitStateError`는 결과를 덮지 않는다. 남은 lease는 `tryAcquire`가 만료·프로세스 종료 시 정리한다.
- `limited()`, `check()`, `tryAcquire()`는 바꾸지 않았다(429/503 기록 실패와 보내기 전 상태 오류는 계속 중단).
- `rdap.ts`: `status`가 배열일 때만 문자열 원소를 쓴다.
- 테스트: `src/checker/rdap.test.ts`에 9건 추가. 변경 전 7건이 실패했고, 2건(객체 `status`, 429 기록 실패)은 회귀 방지용으로 변경 전에도 통과했다.
- checker 서명 갱신: `catalog:update data-sources/catalog` 미리보기에서 추가·삭제·경로·리뷰·분류 변경 0건 확인 후 `--apply`. 두 스냅샷에서 바뀐 키는 `version`, `generatedAt`, `checkerSignatures`뿐이다.
- 문서: `docs/current.md`(상태 오류 문단, 서명 갱신 기록), `docs/backlog.md`(A3·A16 완료).

## 검증 (macOS arm64, Bun 1.4.2, Node 24.19.0)

| 명령 | 결과 |
|---|---|
| `bun test` | 627 통과 / 0 실패, 24,172 expect |
| `bun run typecheck`, `bun run web:typecheck` | 통과 |
| `bun run catalog:verify` | 통과 |
| `bun run docs:check` | 통과. 녹화 입력 변경 경고: `admission.ts`, `limits.ts`, `rdap.ts` |
| `bun run build:npm` → `node tests/limits/runner.mjs` | Bun·Node 모두 통과 |
| 재현(잠금 2.5초) | `taken`, `httpStatus` 200, lease 없음 |
| 재현(잠금 5.5초) | `taken`, lease 1개 남음 → 같은 home의 다음 프로세스 조회 후 `leases: []` |
| A3 TUI 재현(문자열 `status`) | 오류 화면 없이 상세 표시, 앱 계속 실행 |

녹화 영향 검토: 바뀐 경로는 상태 저장 실패와 형식이 잘못된 `status` 처리뿐이다. 녹화는 정상 응답의 합성 RDAP를 쓰므로 화면·상호작용은 바뀌지 않는다. 다시 녹화하지 않는다.

미검증: Windows 실행, 원격 CI, 실제 레지스트리 응답.
