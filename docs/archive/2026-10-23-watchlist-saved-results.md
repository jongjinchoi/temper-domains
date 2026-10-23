# 2단계: 워치리스트 조회 결과 저장 · 만료 임박 강조 · 풀림 표시 · `list --format json`

기준: `main @ 52599fa`. 상태: 구현·로컬 검증 완료, 커밋 전.

## 결정 (사용자)

- 범위: 조회 결과 저장, 만료 임박 강조, "taken → available" 변화 표시, `temper list --format json`.
- 정기 알림과 "내 도메인 관리"는 제외한다.
- 만료 임박 기준: 30일 고정. 만료가 지난 경우도 포함한다.

## 근거 (변경 전 확인)

- `watchlist.json` 항목은 `{domain, addedAt}`뿐이었다. 조회 결과를 저장하지 않아 지난번과 비교할 수 없었고, `list`에는 옵션이 없었다.
- 배포된 모든 버전(v0.1.1–v0.7.2)이 항목의 추가 필드를 그대로 다시 쓴다. 각 태그의 `src/config/watchlist.ts`와 `src/utils/fs.ts`를 확인했다. 그래서 새 필드는 이전 버전과 함께 써도 유실되지 않는다.
- 자동 업데이트 확인은 `--format json`이면 이미 제외된다(`src/update/policy.ts`).

## 변경

- `src/config/watchlist.ts`
  - `WatchEntry`에 선택 필드를 추가했다: `lastStatus`, `checkedAt`, `expiryDate`, `registrar`, `previousStatus`, `statusChangedAt`.
  - `loadWatchlist`는 형식이 틀린 선택 필드를 버리고 알 수 없는 필드는 보존한다.
  - `recordWatchResults`
    - 한 번의 트랜잭션으로 아직 남아 있는 항목만 갱신한다(삭제된 도메인은 되살리지 않음).
    - 응답을 받은 행만 반영한다.
    - taken일 때만 만료일과 등록 기관을 저장한다.
    - 상태가 바뀌면 이전 상태와 변경 시각을 기록한다.
    - 저장된 목록을 반환한다.
  - `freedSince`: "was taken" 판정을 TUI와 MCP가 함께 쓴다.
- `src/tui/format-date.ts`: `expiryDays`, `isExpirySoon`(`EXPIRY_SOON_DAYS = 30`). `formatDetailExpiry`의 출력은 그대로다.
- `src/tui/WatchlistView.tsx`, `watchlist-state.ts`
  - 새로 고침이 끝까지 완료됐을 때만 저장한다. 저장에 실패하면 행은 그대로 두고 오류를 표시한다(`recordFailed`).
  - 30일 이내이거나 지난 만료일은 노랑으로 표시한다.
  - "was taken"은 초록으로 표시한다.
- `src/index.ts`: `list -f, --format <tui|json>`
  - JSON 경로는 테마, 업데이트 확인, Ink를 실행하지 않고 자동 예산으로 조회한 뒤 저장하고 출력한다.
  - 저장에 실패하면 출력은 하고 `exitCode = 1`로 끝낸다(`exit()`를 쓰지 않아 파이프 출력이 잘리지 않는다).
- `src/mcp/server.ts`
  - `check_watchlist`: 답을 저장하고, 실패하면 경고를 붙인다. "was taken"을 표시한다. annotations를 `readOnlyHint: false, destructiveHint: false`로 바꿨다(이제 로컬 파일에 쓴다).
  - `list_watchlist`: 조회 없이 저장값(마지막 확인, 만료일, 등록 기관, 변화)을 보여 준다.
  - 서버 지침과 도구 설명을 갱신했다.
- 문서
  - `docs/cli.md`(`docs:help`로 도움말 블록 갱신, Watchlist 단락)
  - `docs/current.md`, `docs/mcp.md`, `web/app/llms.txt/route.ts`
  - `docs/backlog.md`(`:60` 완료, `:12` 메모)
- 테스트(먼저 작성해 실패 확인)
  - 저장 4건(병합·미부활, 미해결 유지와 상태 변화, 손상 필드, 동시 추가)
  - `expiryDays`/`isExpirySoon` 1건
  - TUI `watch-saved` 1건(노랑 ANSI, "was taken", 파일 저장)
  - MCP 1건(저장, `list_watchlist` 무조회 표시)
  - CLI 4건(`list --format jsn` 거부, 빈 목록, 출력과 저장, 저장 실패 시 exit 1)
- 테스트 도우미 보정
  - `tui-boundaries-worker`의 워치리스트 모의 모듈에 새 export(`recordWatchResults`, `freedSince`)를 추가했다.
  - `tui-storage-worker`의 watch 시나리오는 자동 저장이 끝난 뒤에 잠금 삭제 실패 주입을 켜도록 바꿨다. 원래 검증 대상(삭제 정리 실패 안내)은 그대로다.

checker 파일은 바꾸지 않았다(`catalog:verify` 통과, 서명 갱신 없음).

## 검증 (macOS arm64, Bun 1.4.2, Node 24.22.0)

| 명령 | 결과 |
|---|---|
| `bun test` (최종) | 647 통과 / 0 실패, 24,361 expect |
| `bun run typecheck`, `bun run web:typecheck` | 통과 |
| `bun run catalog:verify` | 통과 |
| `bun run docs:check` | 통과. 녹화 입력 변경 안내: `watchlist.ts`, `index.ts`, `WatchlistView.tsx`, `format-date.ts`, `watchlist-state.ts` |
| `bun run build:npm` + `node --test tests/runtime/node-checks.mjs` | 17/17 통과 |
| 임시 home 실제 실행(`node dist/npm/index.js`) | `watch example.com` → `list --format json`(실제 RDAP 1건: taken, 만료일 2027-08-13, 등록 기관) → 파일 저장 확인 → MCP `list_watchlist`가 조회 없이 저장값 표시 |

녹화 영향 검토: `media:record --only watchlist`로 미리 녹화한 PNG가 커밋된 `watchlist.png`와 같은 내용이었다. 첫 조회라 저장값이 없고, 만료일이 142일 남아 강조도 없기 때문이다. 다시 녹화하지 않는다.

중간 실행: 전체 `bun test` 1차는 622 통과·25 실패였다. 실패는 모두 `tui-boundaries-worker`가 새 export `freedSince`를 모의하지 않아 즉시 종료한 것이었고, 모의 모듈을 보정했다.

미검증: Windows, 원격 CI, 실제 WHOIS 경로, 80열 터미널의 실제 화면.
