# 1단계: MCP 워치리스트 도구 + 워치리스트 만료일 표시

기준: `main @ ef9f12b`. 상태: 구현·로컬 검증 완료, 커밋 전.

## 결정 (사용자)

- 워치리스트는 타인이 보유한, 갖고 싶은 도메인을 지켜보는 목록이다. 등록 가능한 도메인은 바로 등록한다.
- 만료일·등록 기관·상태 코드는 워치리스트 조회에서만 노출한다. 등록인 이름은 노출하지 않는다.
- MCP는 워치리스트 전용 조회 도구(`check_watchlist`)를 둔다. 100개를 넘으면 조회하지 않고 `domains`로 나눠 조회하도록 알린다.
- GIF 재녹화는 별도 단계로 한다(`docs/backlog.md`).

## 근거 (변경 전 확인)

- RDAP 조회는 응답 200마다 `parseRdapResponse`를 실행했지만 `rdapLookup`이 상세 필드를 버렸다(`src/checker/rdap.ts`).
- WHOIS 조회는 상세 조회와 같은 `whoisRaw` 응답을 받았지만 파싱하지 않았다(`src/checker/whois.ts`). 그래서 추가 요청 없이 값을 얻을 수 있다.
- 조회 결과는 CLI JSON, MCP 검색 도구, 웹 `/api/check/`·`/api/example/`가 같은 경로를 공유한다. 그래서 무조건 넣지 않고 옵션으로만 켠다.
- 실제 응답 샘플(임시 home, `temper whois --format json`): example.com, google.dev, bbc.co.uk(RDAP), google.io(WHOIS, 원문 `Z` 포함), nic.cr(WHOIS) 모두 만료일이 있었다. 전체 TLD의 대표 표본은 아니다.

## 변경

- checker
  - `CheckOptions.includeRegistration`을 `batch.ts` → `lookup.ts` → `rdapLookup`/`whoisLookup`으로 전달한다.
  - `registrationFields`(`types.ts`)는 `expiryDate`, `registrar`, `statusCodes`만 고른다.
  - WHOIS는 `taken`일 때만 상세 조회와 같은 파서·프로필로 파싱한다.
  - 옵션이 꺼진 기존 출력은 그대로다.
- `removeWatch`가 실제로 지웠는지를 `boolean`으로 반환한다. `watchKey`를 export했다(MCP의 워치리스트 포함 여부 판정에 사용).
- MCP 도구 4개
  - `watch_domain`, `list_watchlist`, `unwatch_domain`, `check_watchlist`
  - annotations: 쓰기·파괴적 표시, `check_watchlist`는 openWorld.
  - 지침: 사용자 요청 시에만 추가·삭제, 만료일은 참고 정보, 100개 단위 페이지.
  - 인자가 모두 선택인 `check_watchlist`의 무인자 호출을 stdio에서 허용(`list_supported_tlds`와 같은 처리).
  - `formatFullDomainResults`에 제목 인자를 추가하고 등록 정보 줄을 출력한다.
- TUI `temper list`
  - taken 행에 만료일(`formatDetailExpiry`)과 20자로 줄인 등록 기관을 표시한다.
  - 열 순서: 도메인, 상태, 추가 시각(10칸), 조회 정보 또는 등록 정보. 정렬을 맞추려고 바꿨다.
  - 상태 코드는 표시하지 않는다.
- 카탈로그 checker 서명 갱신
  - 미리보기에서 추가·삭제·경로·리뷰·분류 변경 0건을 확인한 뒤 `--apply`했다.
  - 바뀐 키: `catalog.json`은 `version`, `generatedAt`, `checkerSignatures`. `runtime-catalog.json`은 `catalogVersion`, 그리고 `inventory`의 같은 세 키.
  - 조회 관측: needs-recheck 615, not-checked 141. 격하되는 관측은 없다.
- 문서
  - `docs/current.md`, `docs/mcp.md`, `docs/cli.md`, `AGENTS.md`(11 tools)
  - `web/lib/temper-data.ts`(`MCP_TOOLS`, FAQ, 04 KEEP 본문), `web/app/llms.txt/route.ts`
  - `docs/backlog.md`(만료일 항목 진행, GIF 항목 보강)
- 테스트
  - RDAP·WHOIS·배치 단위(옵션 유무, 등록인 제외)
  - `removeWatch` 반환값
  - MCP stdio: 도구 11개와 annotations, 추가·목록·조회·삭제 흐름, 100개 초과 거부(조회 없음), 워치리스트 밖 도메인 거부, 일반 조회에는 필드가 붙지 않음
  - MCP 지침
  - TUI 워치리스트 행
  - `src/extensions/startup.test.ts`의 도구 수 7 → 11

변경 전 새 테스트는 모두 실패했다: checker 3건, `removeWatch` 1건, MCP stdio 3건, TUI 1건.

## 검증 (macOS arm64, Bun 1.4.2, Node 24.22.0)

| 명령 | 결과 |
|---|---|
| `bun test` | 첫 실행: 634 통과·1 실패(`startup.test.ts`의 도구 수 7 고정값). 수정 후 최종 실행: 635 통과·0 실패, 24,236 expect |
| `bun run typecheck`, `bun run web:typecheck` | 통과 |
| `bun run catalog:verify` | 통과(갱신 전에는 실패 확인) |
| `bun run docs:check` | 통과. 녹화 입력 변경 경고에 `types.ts`, `whois.ts`, `watchlist.ts`, `WatchlistView.tsx` 등 |
| `bun run build:npm` → `node tests/limits/runner.mjs` | Bun·Node 통과 |
| `node tests/transport/runner.mjs` | 통과 |
| `node --test tests/runtime/node-checks.mjs` | 17/17 통과 |
| `bun run web:build` + `bash tests/browser/run.sh` | 통과. 빌드가 히어로 예시로 실제 레지스트리 10건 조회 |
| `bun test web/lib` | 38/38 통과 |
| 실제 MCP stdio(임시 home, `node dist/npm/index.js mcp`) | 도구 11개. example.com 추가 → 목록 → 조회(실제 RDAP 1건: 만료일, 등록 기관, 상태 코드, 등록인 키 없음) → 삭제 → 빈 목록 |

녹화 영향 검토: 워치리스트 화면의 열 순서와 내용이 바뀌었으므로 `watchlist` 녹화는 낡았다. 재녹화는 백로그 항목으로 미뤘다(사용자 결정). 다른 화면은 바뀌지 않았다.

관찰: 전체 TUI 테스트를 한 번 실행했을 때 `browser accepted feedback preserves search results without premature success`가 한 번 실패했다. 단독으로 3회 재실행하면 모두 통과했다. 검색 화면 테스트이고, 이번 변경과의 관련은 확인하지 못했다.

미검증: Windows 실행, 원격 CI, 실제 WHOIS 경로의 MCP 조회, 80열 터미널의 실제 화면.
