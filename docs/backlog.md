# temper Backlog

## 배포
- [ ] npm publish (`npm publish --access public`)
- [ ] brew 바이너리 재빌드 + Release 업데이트 (dist 경로 변경됨)
- [ ] README Install 섹션에 `npm i -g temper-domains` 추가
- [ ] README MCP 섹션에 `npx temper-domains mcp` 방식 추가

## 기능 개선
- [ ] search 화면에서 `e` 키로 extended TLD 전환 (30 ↔ 59)
- [ ] search ↔ history ↔ suggest 간 화면 전환 시 이전 검색 결과 유지
- [ ] watchlist 알림 기능 (cron 또는 launchd로 주기적 체크)
- [ ] `temper` 인자 없이 실행 시 마지막 검색 또는 메인 메뉴 표시

## 코드 품질
- [x] 테스트 작성 (bun test) — 93개 테스트 통과
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
- [ ] GitHub Pages 또는 별도 랜딩 페이지

## 배포 채널 확장
- [ ] homebrew-core 제출 (Stars 225+ 달성 시)
- [ ] Hacker News Show HN 포스트
- [ ] Reddit r/commandline, r/ClaudeAI 포스트
- [ ] awesome-tuis PR 제출

## 향후 확장 — 기능
- [x] WHOIS/RDAP 상세 조회 (`temper whois <domain>`) — 만료일, 등록자, 네임서버 등 표시. CLI + TUI(`i` 키) + MCP tool `whois_domain`. RFC 9083 준수
- [ ] 만료일 기반 워치리스트 강화 — 위 WHOIS 상세 조회로 expirationDate를 가져와 watchlist에 표시. 만료 30일 이내 하이라이트. `--format json`과 결합해 크론탭/슬랙 알림 파이프 가능
- [ ] DNS 레코드 조회 (`temper dns <domain>`) — A, AAAA, MX, TXT, CNAME, NS 조회. dns.ts의 resolve() 확장. MCP tool `dns_lookup` 추가. `--format json` 지원

## 향후 확장 — 플랫폼
- [ ] GUI 데스크톱 앱 (메뉴바 tray) — CLI를 안 쓰는 사용자/비개발 직군 대상. 사용자 수요 확인 후 진행. Tauri 또는 Electron 검토
