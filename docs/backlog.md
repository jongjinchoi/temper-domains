# temper Backlog

## 배포
- [x] npm publish 자동화 및 `temper-domains@0.3.3` 게시
- [x] GitHub Release 바이너리 5종 생성 및 Homebrew tap formula 업데이트
- [x] README Install 섹션에 Homebrew, npm global, npx, source 실행 경로 정리
- [x] README MCP 섹션에 global install과 npx command/args 방식 정리

## 기능 개선
- [ ] search 화면에서 `e` 키로 extended TLD 전환 (30 ↔ 60)
- [x] search ↔ history ↔ suggest 간 화면 전환 시 기존 검색 세션 결과 유지 (history 항목의 새 검색은 검색어만 재사용)
- [ ] watchlist 알림 기능 (cron 또는 launchd로 주기적 체크)
- [ ] `temper` 인자 없이 실행 시 마지막 검색 또는 메인 메뉴 표시

## 코드 품질
- [x] 승인된 안정 버전 의존성 갱신, Bun/Node 버전 고정 및 Node 최소 버전 명시 (2026-09-19, 로컬 검증)
- [x] 사용자 요청으로 개발·검증의 Bun/Node 특정 버전 고정 해제; 의존성의 Node 최소 지원 조건 유지 (2026-09-21)
- [x] config 전체 갱신 잠금·완성 파일 교체와 Init 저장 실패·중복 입력 처리 (2026-09-21)
- [x] 검색 필터 결과·선택·스크롤 범위 일치 및 창 크기 변경 회귀 검증 (2026-09-21)
- [x] watchlist 동시 갱신 보호와 손상된 config/history/watchlist 원본 보존
- [x] TUI 대문자 검색·bootstrap 실패·suggest 하위 화면 Escape 처리 수정
- [x] 웹 데모 검색 중 Escape·입력 포커스·접근성 이름·모바일 페이지 넘침 수정
- [x] 웹 응답 완료 이벤트 누락 방어 및 OG/Twitter 이미지 Node.js runtime 전환
- [x] 테스트 작성 및 `bun test` 통과
- [x] 보안: 도메인 입력 검증 (sanitizeDomain, encodeURIComponent)
- [x] 보안: readJson JSON.parse try-catch
- [x] 보안: bootstrap fetch 5초 타임아웃
- [x] 보안: parseInt NaN 방어
- [x] 보안: fire-and-forget promise .catch()
- [x] 리팩토링: 버전 문자열 통일 (PKG_VERSION build-time define)
- [x] 리팩토링: getTld() 유틸 (4곳 중복 제거)
- [x] 리팩토링: PREFIXES/SUFFIXES 상수 통합 (types.ts)
- [x] 리팩토링: MCP 레지스트라 enum 동적 생성
- [x] 리팩토링: ensureConfigDir() 공통 함수 (4곳 중복 제거)
- [x] Node.js 호환: Bun 전용 API → node:fs/node:net
- [x] Node.js 호환: .ts/.tsx import 확장자 추가
- [x] npm publish 준비: engines, repository.url, peerDeps 제거
- [x] npm publish 준비: README 이미지 절대 경로
- [x] dns/promises → node:dns/promises 접두사
- [x] CI/CD: GitHub Actions에서 tsc --noEmit 타입 체크
- [x] CI/CD: npm publish 자동화 (tag push 시)
- [x] MCP 도구 핸들러 try-catch 에러 처리 (isError 응답)
- [x] useEffect 비동기 cleanup (WatchlistView cancelledRef, SuggestView cancelled flag)
- [x] SearchView 커스텀 훅 분리 (useSearchExecution)
  - useListNavigation은 React 공식 문서 기준 편의 래퍼 안티패턴 → 미추출

## 문서
- [ ] README: About description 설정 완료 확인
- [ ] README: topics 설정 완료 확인
- [x] Next.js landing/live demo site (`web/`) 구축

## 배포 채널 확장
- [ ] homebrew-core 제출 (Stars 225+ 달성 시)
- [ ] Hacker News Show HN 포스트
- [ ] Reddit r/commandline, r/ClaudeAI 포스트
- [ ] awesome-tuis PR 제출

## 향후 확장 — 기능
- [x] WHOIS/RDAP 상세 조회 (`temper whois <domain>`) — 만료일, 등록자, 네임서버 등 표시. CLI + TUI(`i` 키) + MCP tool `whois_domain`. RFC 9083 준수
- [ ] 만료일 기반 워치리스트 강화 — 위 WHOIS 상세 조회로 `expiryDate`를 가져와 watchlist에 표시. 만료 30일 이내 하이라이트. `--format json`과 결합해 크론탭/슬랙 알림 파이프 가능
- [ ] DNS 레코드 조회 (`temper dns <domain>`) — A, AAAA, MX, TXT, CNAME, NS 조회. MCP tool `dns_lookup` 추가. `--format json` 지원

## 향후 확장 — 플랫폼
- [ ] GUI 데스크톱 앱 (메뉴바 tray) — CLI를 안 쓰는 사용자/비개발 직군 대상. 사용자 수요 확인 후 진행. Tauri 또는 Electron 검토

## 전수조사 후속 작업 (2026-09-30, main @ 846d68e)
상세: `docs/internal/audit-2026-09-30-full-report.md`, `docs/internal/audit-2026-09-30-src-mcp-report.md` (저장소 미포함)
- [x] 확인된 결함·높음: 조회 중 SIGINT·SIGTERM·SIGHUP으로 `lookup-limits.json.lock`이 남아 같은 home의 모든 조회가 `limit_state_error` — 신호를 받으면 진행 중인 파일 트랜잭션을 끝낸 뒤 128+신호번호로 종료하도록 수정 (`src/utils/shutdown.ts`) (A14, 2026-09-30)
- [ ] 조건부 위험·중간: Windows(릴리스 대상)에서 TUI·저장·checker·MCP 테스트가 실행되지 않고 macOS CI도 src/update만 실행 (`.github/workflows/ci.yml:80-109`) (A28)
- [ ] 선택적 개선·중간: RDAP 네이티브 전송의 8 MiB 본문·해제 상한과 deflate·br 해제를 검증하는 테스트 추가 (`src/checker/http-transport.ts:43`) (A27)
- [ ] 확인된 결함·낮음: 첫 429/503 뒤 재허가가 마감에 걸리면 이미 보낸 요청이 `deadline_before_start`가 되고 retryAt을 잃음 (`src/checker/rdap.ts:128`) (A1)
- [ ] 확인된 결함·낮음: WHOIS 날짜가 TUI에서 호스트 시간대에 따라 하루 밀려 표시됨 (`src/tui/WhoisView.tsx:85`) (A4)
- [x] 확인된 결함·낮음: 워치리스트가 IDN의 Unicode·xn-- 형태를 다른 항목으로 저장 — 비교 키를 ASCII 형태로 통일, 표시는 입력한 형태 유지 (`src/config/watchlist.ts`) (A5, 2026-09-30)
- [x] 확인된 결함·낮음: 거부된 RDAP 리다이렉트가 재개 가능한 `network_error`로 분류됨 — `invalid_response`로 분류(형식이 잘못된 Location 포함) (`src/checker/rdap.ts`) (A6, 2026-09-30)
- [ ] 확인된 결함·낮음: media-package 테스트의 엄격 모드 단언이 주입한 변경 없이도 통과 (`scripts/media-package.test.ts:27`) (A33)
- [ ] 확인된 결함·낮음: real-install 대화형 모드가 Later를 안내하지만 Later 선택 시 실패로 끝남 (`tests/update/real-install.mjs:159`) (A35)
- [ ] 조건부 위험·낮음: RDAP 응답의 문자열 `status`가 `statusCodes`로 들어가 whois_domain·TUI 상세가 실패 (`src/checker/rdap.ts:238`) (A3)
- [x] 조건부 위험·낮음: 회복 중인 origin이 3xx로 응답하면 연속 성공 기록이 초기화됨 — 받아들인 리다이렉트를 그 서버의 정상 응답으로 셈, "valid answer" 정의를 문서에 추가 (`src/checker/rdap.ts`) (A7, 2026-09-30)
- [ ] 조건부 위험·낮음: 워치리스트 새로고침 중 삭제가 들어오면 새로고침이 버려져 checking 행이 남음 (`src/tui/WatchlistView.tsx:45`) (A13)
- [ ] 조건부 위험·낮음(정책 결정 필요): 응답 뒤 상태 기록이 실패하면 받은 응답을 버리고 `limit_state_error`로 보고 (`src/checker/admission.ts:21`) (A16)
- [ ] 조건부 위험·낮음: updater PTY 드라이버가 자식 종료 감지 후 남은 출력을 읽지 않고 단언 (`tests/update/terminal-check.py:76`) (A19)
- [ ] 조건부 위험·낮음: `media:record --apply`가 `--record-package` 선행을 검사하지 않고 안내에서도 빠뜨림 (`scripts/media/record.ts:80`) (A40)
- [ ] 결정 필요: Vercel 대시보드의 Root Directory 값을 확인해 `vercel.json`의 `cd ..` 전제를 `docs/current.md`에 기록 (A48)
