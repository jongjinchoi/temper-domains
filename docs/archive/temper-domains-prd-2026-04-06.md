# temper.domains — Product Requirements Document

**Domain:** temper.domains  
**Version:** 2.0  
**Date:** 2026-04-06  
**Stack Migration:** Go → Bun/TypeScript (Claude Code 생태계 정렬)  
**Author:** Jongjin Choi  
**GitHub:** github.com/choi-jongjin/temper (오픈소스)

---

## 1. Overview

### 핵심 카피
> **"Never leave your terminal to find a domain."**

### 한 줄 요약
터미널을 벗어나지 않고 도메인을 검색하고 구매까지 완료하는 오픈소스 CLI + MCP 툴.

### 이름의 의미
**temper** — 담금질(quenching). 대장장이가 쇠를 두드리고 식혀 단단하게 만들듯, 도메인을 확실하게 확보한다. CLI 명령어(`temper search`, `temper mcp`)로도 자연스럽게 읽힌다.

### 배경
Vibe coder가 Claude/Cursor로 서비스 이름을 지을 때, 자연스러운 플로우는:

```
1. Claude에게 이름 추천 요청
2. Claude가 이름 제안
3. Claude에게 "도메인 사용 가능한지 확인해줘"
4. ❌ 여기서 막힘
```

Claude Code가 시도하는 2가지 방법, 둘 다 실패:

```
방법 1: WebFetch로 도메인 조회 사이트 스크래핑
 → 봇 차단 (Cloudflare, reCAPTCHA 등)으로 막힘

방법 2: whois 명령어 직접 실행
 → raw 텍스트 파싱이 TLD마다 달라 추측 파싱 → 부정확
```

결과: 사람이 브라우저를 열고 수동으로 조회 → AI와의 대화 흐름이 끊기고, 도메인 찾는 데 수십 분이 걸린다.

**temper.domains는 이 루프를 없앤다.**
터미널 탭 하나에서 검색하고, 마음에 들면 키 하나로 구매 페이지로 이동한다. MCP 서버로 띄우면 Claude/Cursor가 직접 호출할 수도 있다.

### 타겟 유저
- **Vibe coder** — Claude/Cursor로 앱을 만들고 도메인을 찾는 인디해커 (핵심 타겟)
- **개발자** — 터미널을 벗어나지 않고 모든 걸 해결하고 싶은 사람
- **인디해커/창업자** — 빠르게 아이디어를 검증하고 도메인을 잡고 싶은 사람

### 포지셔닝
Jongjin Choi가 만드는 vibe coder 툴킷의 일부:

```
도메인 확보      → temper.domains  ← 이 제품
개발 실행        → Localhoston       로컬 개발서버 대시보드
보안/배포 준비   → Tightship         배포 전 보안 체크
운영 중 스택 파악 → GetRundown        사이트 기술 스택 탐지
```

### 제품 진화 경로: CLI → 데스크탑 앱

Temper는 두 형태로 제공되지만 **같은 제품의 다른 진입점**:

```
Phase 1: CLI/TUI (무료, 오픈소스)
   │ 같은 TypeScript 코어 (src/checker, src/registrar, ...)
   │ 같은 UX 철학 (키보드 우선, 즉각성, 로컬 데이터)
   │ 같은 사용자 기반
   ↓
Phase 3: 데스크탑 앱 ($29, GUI 확장)
```

**차별점 핵심**: AI가 도메인 조회하는 기능은 이미 존재함 (Instant Domain Search MCP 등). Temper의 해자(moat)는 **터미널 네이티브 경험**. 웹 기반 서비스가 CLI를 만드는 건 본업 이탈이라 잘 안 함 — 이 공백을 채운다.

---

## 2. 문제 정의

### 핵심 페인포인트: AI가 도메인을 조회할 수 없다

Claude Code, Cursor 등 AI 코딩 도구는 도메인 가용성을 **정확하게 조회할 표준 도구가 없다**. 두 가지 시도 모두 실패한다.

#### 실패 1: WebFetch로 도메인 조회 사이트 스크래핑
```
Claude → WebFetch("https://instantdomainsearch.com/?q=keycove")
       → Cloudflare/reCAPTCHA 등 봇 차단으로 실패
```
주요 도메인 조회 사이트는 전부 스크래핑 방지가 걸려 있다. AI가 "브라우저 대체"로 쓸 수 있는 방법이 봉쇄됨.

#### 실패 2: whois 명령어 직접 실행
```
Claude → shell("whois keycove.com")
       → raw 텍스트 응답
       → Claude가 텍스트 패턴 추측으로 파싱 → 부정확
```

**실측으로 확인된 "whois 부정확"의 진짜 원인**: available 메시지가 TLD마다 완전히 다름.

| TLD | "사용 가능" 메시지 |
|-----|-------------------|
| .com | `No match for domain "XXX.COM".` |
| .io | `Domain not found.` |
| .ai | `Domain not found.` |
| .net | `No match for domain "XXX.NET".` |

AI가 매번 이 패턴을 추측으로 파싱하려다 실패한다. 검증된 파서 라이브러리 없이 whois를 쓰면 부정확할 수밖에 없다.

### 결과: 사람이 매번 수동 조회

1. Claude가 이름 제안
2. 사람이 브라우저 열고 도메인 조회 사이트 방문
3. 결과 확인 후 Claude로 돌아옴
4. "그거 없대, 다른 거 추천해줘"
5. 반복

**AI와의 대화 흐름이 매번 끊긴다.** 이름 5개 확인하는 데 10~15분 걸린다.

### Temper가 제공하는 것

1. **CLI 환경에서 직접 조회** — 터미널에서 `temper search keycove` 한 줄
2. **MCP 서버로 AI에게 조회 능력 부여** — Claude Code가 temper를 직접 호출
3. **검증된 파싱 + RDAP** — TLD별 available 메시지를 라이브러리가 일관되게 처리

---

## 3. 전략

### 오픈소스로 가는 이유
- 인디해커/개발자 커뮤니티에서 입소문으로 퍼짐
- GitHub Star → Hacker News → 트래픽 → Localhoston/Tightship 노출
- 네트워크 없이 트래픽을 만드는 가장 현실적인 방법
- "temper.domains" URL이 멋있어서 공유하고 싶어짐
- 본인이 직접 쓰려고 만드는 도구를 같은 페인포인트 겪는 사람들과 공유

### 수익화 방향: 2단 구조

**1축 — 바이럴 엔진: 오픈소스 CLI (무료)**
- GitHub에 공개, MIT 라이선스
- Homebrew로 배포
- GitHub Star → Hacker News → 커뮤니티 확산
- 목표: 사용자 기반 + 브랜드 인지도

**2축 — 수익 엔진: 데스크탑 앱 ($29 일회성)**
- Phase 3에서 출시 (Localhoston과 동일 모델)
- CLI의 TypeScript 코어를 그대로 재사용 (개발 비용 최소화)
- GUI만 가능한 기능으로 차별화 (메뉴바, 전역 단축키, 멀티탭, 알림 등)
- 구독 아님, 한 번 사면 영구

**수익 여정:**
```
무료 CLI 사용 → 만족 → 유료 GUI 구매 (본인)
             → 동료에게 추천 → 동료 GUI 구매 (비CLI 사용자)
```

### 레지스트라 연결 정책
레지스트라 구매 연결은 **순수 사용자 편의** 목적, 수익 없음 (affiliate 미사용). 수익 없이 추천한다 = **편향 없이 사용자에게 최선을 추천** 가능. GoDaddy 제외, 개발자 친화 4개 (Cloudflare/Porkbun/Namecheap/Vercel)는 순수 품질 기준으로 선정.

---

## 4. 제품 목표

### MVP 목표
- 단어 입력 → 실시간 도메인 가용성 확인 (기본 30개 TLD)
- Progressive rendering으로 결과 오는 대로 즉시 표시
- 원하는 도메인 선택 → 선호 레지스트라의 구매 페이지가 브라우저로 열림

### 성공 지표 (실측 기반)

**성능 목표 (Phase 1 MVP 기준, 기본 30개 TLD)**
- 첫 결과 도착까지 **300ms 이내** (실측: 90~300ms)
- 기본 30개 TLD 98% 도착까지 **1.4초 이내** (실측: 1.4초, .top 같은 outlier 제외)
- 전체 결과 (outlier 포함) **3초 이내** (3초 타임아웃 한도)

**트래픽 목표**
- GitHub Star 500개 (출시 1개월 내)
- Hacker News "Show HN" 등록

---

## 5. 핵심 기능

> **Phase 매핑**: 5.1 (기본 검색) / 5.2 (레지스트라 연결) / 5.5 (MCP)는 **Phase 1 MVP**.  
> 5.1의 Extended/Custom TLD, 5.3 (조합어), 5.4 (Watchlist)는 **Phase 2**.

### 5.1 실시간 도메인 검색 (Progressive Rendering)

타이핑하면서 실시간으로 가용 여부 표시. 결과가 도착하는 대로 TUI가 즉시 업데이트.

**기본 조회 30개 TLD (Instant Domain Search 첫 화면과 동일):**
```
.com .net .org
.ai  .io  .xyz
.app .shop .info
.co  .store .site
.online .dev .tech
.pro .live .lol
.club .vip .link
.top .me  .tv
.blog .cloud .design
.studio .art .fun
```

**Extended 64개 TLD (`--extended` 플래그) — Phase 2:**
기본 30개 + 다음 34개:
```
.one .world .digital .global .space .plus
.media .email .host .page .ltd .biz
.agency .social .stream .zone .website .team
.work .life .love .best .cool .today
.guru .care .fit .marketing .luxury .solutions
.services .money .consulting .bio
```

**Custom TLD (`--tlds=` 플래그) — Phase 2:**
```bash
temper search keycove --tlds=.com,.io,.studio,.design
```

**TUI 출력 예시:**
```
$ temper search keycove

  keycove.com   ❌ taken      ← 0.5s
  keycove.net   ✅ available  ← 0.6s
  keycove.org   ✅ available  ← 0.7s
  keycove.ai    ✅ available  ← 0.6s
  keycove.io    ✅ available  ← 0.8s (whois)
  keycove.app   ✅ available  ← 0.4s
  keycove.dev   ✅ available  ← 0.4s
  keycove.co    ❌ taken      ← 0.9s (whois)
  keycove.shop  ✅ available  ← 0.1s
  ...
  keycove.top   ⏳ checking... (3s timeout)

  Progress: 29/30 (97%) - 1.4s elapsed
```

**진행 원칙:**
- 결과 도착하는 대로 즉시 화면 업데이트 (progressive rendering)
- 3초 타임아웃: 초과 시 "slow" 표시 + 백그라운드 계속 진행
- 색상 구분: ✅ available / ❌ taken / 💎 premium / 🔒 reserved / ⚠️ rate limited

### 5.2 레지스트라 선택 → 웹 연결 (MVP)

도메인 선택 후 키 하나로 선호 레지스트라의 구매 페이지가 바로 열린다. 가격 표시 없이 순수 연결만. 구매는 레지스트라에서 직접.

```
  keycove.app   ✅ available   ← 선택

  구매할 레지스트라를 선택하세요:
  [c] Cloudflare   가장 저렴, 개발자 1순위
  [p] Porkbun      투명한 가격, 업셀 없음
  [n] Namecheap    가장 유명, 입문자 친화
  [v] Vercel       배포까지 한 번에

  → [c] 누르면 domains.cloudflare.com/?domainToCheck=keycove.app 구매 페이지 오픈
```

**레지스트라 선정 근거 (Reddit r/webdev, r/sysadmin, r/selfhosted 조사):**
- **Cloudflare**: 개발자 커뮤니티 압도적 1위. 도매가 그대로, 마크업 없음. "At-cost pricing, no BS"
- **Porkbun**: "The name is silly but legit. No upsells." 투명한 가격, 개발자 커뮤니티 인기 급상승
- **Namecheap**: 인디해커 커뮤니티 전통적 1위. 입문자에게 친숙하고 광범위한 TLD 지원
- **Vercel**: Vibe coder가 이미 배포에 사용 중. 도메인 구매 후 바로 프로젝트 연결 가능

**제외 레지스트라:**
- GoDaddy: Reddit 커뮤니티 전체 기피. "Dark patterns, hidden fees, aggressive upsells"

### 5.3 조합어 자동 생성 (Phase 2)

단어 하나 입력 시 관련 조합어 자동 생성. 접두사(get, use, try, my) + 접미사(ly, app, io, hq) 조합. 모든 조합어 가용 여부 동시 체크.

```
$ temper suggest keycove

  keycove        ✅  getkeycove   ✅  usekeycove   ❌
  keycoveapp     ✅  keycovelabs  ✅  keycovehq    ✅
  mykeycove      ❌  keycovely    ✅  trykeycove   ✅
```

### 5.4 검색 히스토리 & Watchlist (Phase 2)

이전 검색 기록 저장. 마음에 든 도메인 북마크(watchlist). Watchlist 도메인 가용 시 알림.

```
$ temper watch keycove.com   # 가용 알림 등록
$ temper history              # 검색 히스토리
$ temper list                 # Watchlist 확인
```

### 5.5 MCP 서버 (핵심 기능)

**MCP 서버는 부가 기능이 아니라 Temper의 핵심 가치다.** 사용자의 원래 페인포인트("AI가 도메인 조회 못함")를 정면으로 해결하는 기능.

`temper mcp` 서브커맨드로 MCP 서버를 띄우면 Claude Code, Claude Desktop 등 AI 툴이 temper를 직접 도구로 사용할 수 있다. 사람이 터미널에서 명령어를 입력하는 게 아니라, AI가 대화 중 자동으로 호출한다.

**사용 환경별 동작:**

| 환경 | 방식 | 상태 |
|------|------|------|
| 터미널 직접 | `temper search` | ✅ Phase 1 |
| Claude Code | MCP 로컬 프로세스 | ✅ Phase 1 |
| Claude Desktop | MCP 로컬 프로세스 | ✅ Phase 1 |
| Claude.ai 웹 | 원격 MCP 서버 필요 | 🔜 Phase 3 |

**Claude Code 설정 예시:**
```json
// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "temper": {
      "command": "temper",
      "args": ["mcp"]
    }
  }
}
```

**Claude Code 사용 예시:**
```
나: "keycove로 쓸 수 있는 도메인 찾아줘"

Claude Code: [temper MCP 자동 호출]
  → search_domain({name: "keycove", tier: "default"})

Claude Code: keycove.app, keycove.dev, keycove.co 등 28개 사용 가능해요.
             keycove.com과 keycove.io는 이미 taken입니다.
             구매할 레지스트라를 선택하시겠어요?
```

**MCP 제공 툴:**

*Phase 1:*
- `search_domain(name)` — 기본 30개 TLD 가용성 체크
- `open_registrar(domain, registrar)` — 선택한 레지스트라 구매 페이지 오픈

*Phase 2:*
- `search_domain(name, tier?, tlds?)` — tier/tlds 파라미터 확장 (default/extended/custom)
- `suggest_domain(name)` — 조합어 생성 + 가용성 체크
- `watch_domain(domain)` — Watchlist 등록
- `list_watchlist()` — Watchlist 확인

**구현 방식 (공식 MCP TypeScript SDK 사용):**
CLI 바이너리 하나에 서브커맨드로 추가. 도메인 체크 로직은 CLI와 완전히 공유. 입출력 방식만 다름.
```
temper search   →  Ink (React) TUI로 출력 (사람용)
temper mcp      →  MCP StdioTransport로 출력 (AI용)
```

공식 SDK는 Zod 스키마로 tool 입력 검증. Claude Code 자체도 Bun + TypeScript + Ink 스택이라 완벽 정렬:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "temper", version: "0.1.0" });

server.tool(
  "search_domain",
  "Check domain availability across TLDs",
  { name: z.string().describe("domain name without TLD") },
  async ({ name }) => {
    const results = await checkDomains(name);
    return {
      content: [{ type: "text", text: formatResults(results) }]
    };
  }
);

await server.connect(new StdioServerTransport());
```
**주의**: stdio 사용 시 `console.log` 대신 `console.error` 사용 필수 (stdout이 JSON-RPC 통신 채널).

### 5.6 CLI ↔ 데스크탑 앱 기능 매핑 (Phase 3 확장)

Phase 3 데스크탑 앱은 **TUI 기능을 전부 이식 + GUI 전용 기능 추가** 방식. TypeScript 코어 공유로 두 제품이 분기되지 않음.

| 기능 | CLI/TUI (Phase 1~2) | 데스크탑 앱 (Phase 3) |
|---|---|---|
| 도메인 검색 | ✅ `temper search` | ✅ + 멀티탭 동시 비교 |
| 30개 TLD 조회 | ✅ Progressive rendering | ✅ 동일 |
| 레지스트라 선택 | ✅ `c/p/n/v` 키 | ✅ 동일 |
| Watchlist | ✅ CLI 조회 | ✅ + 시스템 알림 |
| History | ✅ `temper history` | ✅ + 시각 차트 |
| 조합어 생성 | ✅ `temper suggest` | ✅ + 결과 사이드바이사이드 |
| MCP 서버 | ✅ 설정 파일 수동 편집 | ✅ 원클릭 활성화 |
| 전역 단축키 | ❌ | ✅ `Cmd+Shift+D` |
| 메뉴바 아이콘 | ❌ | ✅ macOS 메뉴바 |
| 드래그&드롭 | ❌ | ✅ 이름 끌어오기 |
| 시스템 알림 | ❌ | ✅ Watchlist 알림 |

**TypeScript 코어 공유**: `src/checker`, `src/registrar`, `src/config` 모듈은 CLI와 데스크탑 앱(Tauri)이 100% 공유. 버그 수정/성능 개선이 양쪽 동시 반영. Tauri의 JS 프론트엔드가 동일 TypeScript 코어 import.

---

## 6. 기술 스택

### CLI 버전

| 역할 | 선택 | 이유 |
|------|------|------|
| 런타임 | **Bun** (최신) | Anthropic 인수(2025-12), Claude Code 자체가 Bun 기반 — 생태계 완벽 정렬 |
| 언어 | **TypeScript** (ES2024) | vibe coder 타겟 친숙, 기여 장벽 낮음, Claude Code와 동일 |
| CLI 프레임워크 | **commander** v12+ (`commander`) | 28.1k stars, Node.js CLI 사실상 표준, 네이티브 TypeScript |
| TUI 프레임워크 | **Ink** v6.8+ (`ink`) | 37.2k stars, **Claude Code / Gemini CLI / GitHub Copilot CLI 사용**, React 18+ concurrent |
| 도메인 체크 (RDAP) | **직접 구현** (IANA bootstrap + RDAP HTTP) | RFC 9224 표준, fetch API, ~130줄, 완전 통제 |
| 도메인 체크 (whois) | **whoiser** v1.18+ (`whoiser`) | 265 stars, 100% TS, TLD 서버 자동 발견, availability 판단 로직은 Temper가 직접 |
| 병렬 처리 | **Promise.all + p-limit + AbortController** | `pLimit(20)`으로 동시성 제한, 3초 타임아웃, signal 취소 전파 |
| MCP 서버 | **공식 MCP TS SDK** (`@modelcontextprotocol/sdk`) v1.29+ | 12.1k stars, Google 공동 유지보수, Zod 스키마 통합, Claude Code 원조 생태계 |
| 스키마 검증 | **Zod** v4+ (`zod`) | 표준, MCP SDK 내장 통합 |
| 브라우저 오픈 | **stdlib `node:child_process`** (직접 구현) | macOS(open)/Linux(xdg-open)/Windows(start) 20줄, 의존성 X |
| 바이너리 배포 | **`bun build --compile`** + Homebrew tap | 단일 실행파일(50~100MB), 모든 플랫폼 공식 지원 (darwin/linux/windows × arm64/x64) |
| 테마 시스템 | **Ink 컴포넌트 + CSS-in-TS 팔레트** | Temper Forge/Seoul Night/Catppuccin/Dracula/Default, process.stdout 배경 자동 감지 |
| 설정 저장 | **~/.temper/config.json** | Watchlist, 히스토리, 선호 레지스트라, 테마 |

### 데이터 소스 상세

**RDAP (Registration Data Access Protocol) — 주 경로, 직접 구현**
- 2019년 ICANN이 모든 gTLD에 의무화한 현대 프로토콜 (whois의 후계)
- JSON 기반 표준화 응답, HTTP 404 하나로 available 판단
- IANA bootstrap(`https://data.iana.org/rdap/dns.json`)에서 TLD별 서버 주소 제공, RFC 9224 표준
- 1198개 gTLD + 일부 ccTLD(.ai 등) 커버

**구현: 직접 작성** (`src/checker/bootstrap.ts` + `src/checker/rdap.ts`, ~130줄)
- IANA bootstrap JSON 다운로드 + 캐싱 (`~/.temper/cache/rdap-dns.json`, 7일 TTL)
- TLD → RDAP 서버 URL 매핑
- `fetch()` API로 RDAP 쿼리 (Bun 내장)
- HTTP 상태 코드로 판정:
  - `404` → available
  - `200` → taken
  - `429/503` → rate_limited
  - 서버 매핑 없음 → whois fallback
- `AbortController` 3초 타임아웃

**whois — Fallback 경로 (직접 구현 + whoiser)**
- **whoiser** v1.18+ (`whoiser`) — TCP 43 소켓 + 자동 서버 발견 + 공통 필드 파싱
- **availability 판단 로직은 Temper가 직접** (`src/checker/whois.ts`, ~70줄)
  - `Domain Name` 필드 부재 + `text` 배열에 `No match`/`Domain not found`/`NOT FOUND` 패턴 → available
  - `premium` 키워드 → premium
  - `reserved` 키워드 → reserved
  - `rate limit`/`quota exceeded` → rate_limited
  - 그 외 `Domain Name` 존재 → taken
- `node:net` 사용 (Bun 🟢 Fully implemented)
- IANA bootstrap에 없는 ccTLD(.io .co .me 등) 커버

**하이브리드 라우팅 로직:**
```
1. RDAP 쿼리 (IANA bootstrap 기반, 직접 구현)
   ├─ HTTP 404          → available ✅
   ├─ HTTP 200          → taken ❌
   ├─ HTTP 429/503      → rate_limited ⚠️
   ├─ TLD 매핑 없음     → whois fallback
   ├─ timeout (3s)      → slow ⏱️
   └─ 네트워크 에러      → error
2. whois fallback (whoiser + Temper detectStatus)
   ├─ No Domain Name + "not found" 패턴 → available ✅
   ├─ "premium" 키워드                  → premium 💎
   ├─ "reserved" 키워드                 → reserved 🔒
   ├─ "rate limit" 키워드               → rate_limited ⚠️
   └─ Domain Name 존재                  → taken ❌
3. Promise.all + pLimit(20) 병렬 실행
4. AbortController 3초 전체 타임아웃
```

### 테마 시스템

**지원 테마 (MVP 5개):**

| 테마 | 모드 | 컨셉 / 시그니처 색상 |
|------|------|---------------------|
| **🔥 Temper Forge** (기본) | 다크 | **담금질(불×쇠×식힘)** · 불꽃 오렌지 `#ff7a45` |
| **🌃 Seoul Night** | 다크 | **서울의 밤(네온×한강)** · 네온 핑크 `#ff4d8d` |
| **🎨 Catppuccin Mocha** | 다크 | 부드러운 파스텔, 2024~2026 대세 |
| **🧛 Dracula** | 다크 | 고대비, 레거시 인지도 |
| **⚫ Default** | 자동 | 터미널 기본 색상 따름 |

**Temper 오리지널 테마 2종 (시그니처):**
- **Temper Forge**: 제품 이름 "담금질" 유래 직접 연결. 불꽃 오렌지 primary + 강철 청록 + 금색 = 대장간 분위기
- **Seoul Night**: 서울의 밤 도시 정체성. 홍대/강남 네온 핑크 + 한강 다리 청색 + 남산타워 빨강 + 포장마차 앰버 = K-pop/한국 개발자 공감

**사용자 커스텀 테마 지원:**
- `~/.temper/themes/*.json` 위치에 JSON 파일로 정의
- `temper config theme export <name>` 명령어로 기본 테마 복사 → 편집
- GitHub 통해 커뮤니티 테마 공유 가능 (Phase 2 바이럴 포인트)

**자동 다크/라이트 감지** (`glow` 스타일):
- `process.env.COLORFGBG` + `process.stdout.hasColors()` 조합으로 터미널 배경색 감지
- 라이트 모드 지원은 Phase 2 (Catppuccin Latte 추가 예정)

**설정 방법:**
```bash
# 1. 최초 설정 (temper init의 3번째 step)
temper init
  → 테마 선택 (Huh Select 폼)

# 2. 런타임 변경
temper config theme seoul-night
temper config theme --list       # 사용 가능한 테마 확인
temper config theme --reset      # 기본값(temper-forge)로 리셋

# 3. 커스텀 테마
temper config theme export temper-forge > ~/.temper/themes/my-theme.json
vim ~/.temper/themes/my-theme.json
temper config theme my-theme

# 4. 환경변수 오버라이드 (임시)
TEMPER_THEME=seoul-night temper search keycove
```

**config.json 구조 (테마 관련):**
```json
{
  "theme": "temper-forge"
}
```

**커스텀 테마 JSON 구조:**
```json
{
  "name": "my-theme",
  "mode": "dark",
  "colors": {
    "base": "#1a1d23",
    "text": "#e8e6e3",
    "primary": "#ff7a45",
    "available": "#64c896",
    "taken": "#e64545",
    "premium": "#ffbf47",
    "reserved": "#7a8fc4"
  }
}
```

**구현 패키지 구조:**
```
src/theme/
  ├── types.ts         — Theme interface, Palette 타입
  ├── themes.ts        — 5개 팔레트 export (Forge/Seoul/Catppuccin/Dracula/Default)
  ├── loader.ts        — config.json + 커스텀 JSON 로더
  └── detect.ts        — 터미널 배경색 자동 감지 (process.env.COLORFGBG)
```

### 데스크탑 앱 버전 (Phase 3)

| 역할 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | **Tauri** | CLI 코드 재활용, 경량, Localhoston과 동일 스택 |
| UI | **React + Tailwind** | 빠른 개발 |

### API 흐름 (MVP)

```
사용자 입력: "keycove"
    ↓
checkAll(domains, signal) — AsyncGenerator 패턴
    ├─ AbortController(3s timeout)
    ├─ pLimit(20) — 동시 20개 제한
    └─ 각 domain마다 async function:
        ├─ rdap.lookup(domain, signal)  — 직접 구현, IANA bootstrap 기반
        │   ├─ HTTP 404 → Result{status: available}
        │   ├─ HTTP 200 → Result{status: taken}
        │   └─ No TLD mapping → whois fallback
        └─ whois fallback (.io .co .me 등):
            ├─ whoiser(domain, signal)  — TCP 43 + 기본 파싱
            └─ detectStatus(response)    — Temper가 직접 판단
    ↓
yield Result (완료 순서대로)
    ↓
Ink SearchResults 컴포넌트: useState + for-await-of
    ├─ for await (const r of checkAll(...)) { setResults(prev => [...prev, r]) }
    └─ React 자동 re-render (progressive)
    ↓
3초 타임아웃 초과 시 "slow" 표시 (background 계속)
    ↓
사용자 도메인 선택 → useInput hook → 레지스트라 선택 (c/p/n/v)
    ↓
child_process로 브라우저 오픈 (macOS: open, Linux: xdg-open, Windows: start)
    ↓
~/.temper/history.json 저장 (Bun.file + JSON.stringify)
```

### 코드 구조 (src/ 분할)

```
temper/
├── src/
│   ├── index.ts                 — CLI entrypoint, commander
│   ├── commands/
│   │   ├── search.ts            — temper search [query] [--extended] [--tlds=]
│   │   ├── mcp.ts               — temper mcp (MCP 서버 시작)
│   │   ├── init.ts              — temper init (Huh 스타일 폼)
│   │   ├── history.ts           — temper history
│   │   ├── list.ts              — temper list (Watchlist)
│   │   └── config.ts            — temper config theme <name>
│   ├── checker/
│   │   ├── bootstrap.ts         — IANA bootstrap 파싱/캐싱 (~50줄) [직접]
│   │   ├── rdap.ts              — RDAP fetch + 404 감지 (~80줄) [직접]
│   │   ├── whois.ts             — whoiser wrapper + detectStatus (~70줄) [직접+lib]
│   │   └── checker.ts           — AsyncGenerator + pLimit (~60줄) [직접]
│   ├── tui/
│   │   ├── App.tsx              — Ink 루트 컴포넌트
│   │   ├── SearchResults.tsx    — 결과 리스트 + 선택
│   │   ├── RegistrarModal.tsx   — 레지스트라 선택 팝업
│   │   └── Spinner.tsx          — 로딩 스피너
│   ├── mcp/
│   │   └── server.ts            — MCP TS SDK + StdioTransport
│   ├── registrar/
│   │   ├── urls.ts              — 레지스트라 URL 매핑
│   │   └── browser.ts           — child_process 브라우저 오픈
│   ├── theme/
│   │   ├── themes.ts            — 5개 팔레트 정의
│   │   └── loader.ts            — config + custom theme JSON 로더
│   └── config/
│       ├── config.ts            — ~/.temper/config.json
│       ├── history.ts           — ~/.temper/history.json
│       └── watchlist.ts         — ~/.temper/watchlist.json
├── build.ts                     — bun build --compile 스크립트
├── package.json
├── tsconfig.json
├── bun.lock
└── .github/workflows/release.yml — 자동 릴리스 + Homebrew tap 업데이트
```

### 레지스트라 URL 매핑 (실측 확인됨)

```typescript
// src/registrar/urls.ts
export const REGISTRAR_URLS = {
  cloudflare: "https://domains.cloudflare.com/?domainToCheck=%s",
  porkbun:    "https://porkbun.com/checkout/search?q=%s",
  namecheap:  "https://www.namecheap.com/domains/registration/results/?domain=%s",
  vercel:     "https://vercel.com/domains/%s",
} as const;

export type Registrar = keyof typeof REGISTRAR_URLS;

export function buildURL(registrar: Registrar, domain: string): string {
  return REGISTRAR_URLS[registrar].replace("%s", encodeURIComponent(domain));
}
```

### 크로스 플랫폼 브라우저 오픈 (stdlib 직접 구현)

```typescript
// src/registrar/browser.ts
import { spawn } from "node:child_process";

export function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  let args: string[];

  switch (platform) {
    case "darwin":  cmd = "open"; args = [url]; break;
    case "linux":   cmd = "xdg-open"; args = [url]; break;
    case "win32":   cmd = "cmd"; args = ["/c", "start", "", url]; break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}
```
20줄 미만으로 외부 의존성 없이 구현. stdio 방식으로 백그라운드 실행.

### Bun Compile 설정 (단일 실행파일 배포)

```typescript
// build.ts — 크로스 플랫폼 컴파일 스크립트
const TARGETS = [
  "bun-darwin-arm64",   // Apple Silicon
  "bun-darwin-x64",     // Intel Mac
  "bun-linux-x64",      // Linux x64
  "bun-linux-arm64",    // Linux ARM
  "bun-windows-x64",    // Windows x64
] as const;

for (const target of TARGETS) {
  await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: {
      target,
      outfile: `./dist/temper-${target}`,
    },
    minify: true,
    sourcemap: "linked",
    bytecode: true,  // 2x 시작 속도 향상
  });
}
```

**실행파일 크기** (실측 예상): 60~80MB per 플랫폼 (Bun 런타임 포함, minify + bytecode 적용 시)

**GitHub Actions 릴리스 워크플로** (`.github/workflows/release.yml`):
```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build.ts   # 5개 타겟 모두 빌드
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/temper-*
  homebrew:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Update homebrew-temper tap
        # GitHub Releases의 바이너리를 참조하는 .rb 파일 자동 생성/업데이트
```

**릴리스 흐름**:
```
1. git tag v0.1.0 && git push origin v0.1.0
2. GitHub Actions가 5개 플랫폼 바이너리 빌드
3. GitHub Releases에 업로드
4. homebrew-temper 레포에 Formula 자동 커밋
5. 사용자: brew tap choi-jongjin/temper && brew install temper
```

### Phase 2 API 흐름 (구매 API 직접 연동)

```
사용자 도메인 선택
    ↓
Porkbun API 또는 Vercel API → 직접 구매
    ↓
구매 완료 알림 터미널에 표시
```

**Phase 2 레지스트라 API 우선순위:**
- **Porkbun**: JSON REST API, IP 화이트리스트 불필요, 설정 간단
- **Vercel**: Bearer 토큰만으로 가격 조회 + 구매 가능, vibe coder 친화적
- **Namecheap**: XML API, IP 화이트리스트 필요, 복잡하지만 사용자 기반 가장 넓음

---

## 7. UX 플로우

### 설치 및 초기 설정

```bash
# Homebrew로 설치 (자체 tap 사용)
brew tap choi-jongjin/temper
brew install temper

# 초기 설정 (최초 1회, 외부 API 키 불필요)
temper init
  → 선호 레지스트라 (c/p/n/v): c
  → ✅ Setup complete
```

### 기본 명령어

```bash
temper search                        # 인터랙티브 모드 (기본 30개 TLD)
temper search keycove                # 바로 검색 (기본 30개 TLD)
temper search keycove --extended     # Extended 64개 TLD
temper search keycove --tlds=.com,.io,.studio  # Custom TLD
temper suggest keycove               # 조합어 추천 + 가용성 동시 체크
temper watch keycove.com             # 가용 시 알림 등록
temper history                       # 검색 히스토리
temper list                          # Watchlist 확인
temper mcp                           # MCP 서버 모드 (Claude Code/Desktop용)
temper config theme dracula          # 테마 변경
temper config theme --list           # 사용 가능한 테마 목록
```

---

## 8. 개발 로드맵

### Phase 1 — CLI + MCP MVP (2주)
- [ ] Bun 프로젝트 세팅 (`bun init`, TypeScript strict, commander v12) + GitHub 공개
- [ ] `src/checker/bootstrap.ts`: IANA bootstrap 파싱 + 로컬 캐싱 (7일 TTL)
- [ ] `src/checker/rdap.ts`: RDAP fetch + AbortController + 404 감지 (직접 구현)
- [ ] `src/checker/whois.ts`: whoiser wrapper + `detectStatus()` 판단 로직
- [ ] `src/checker/checker.ts`: AsyncGenerator + `pLimit(20)` + 3초 타임아웃
- [ ] 30개 기본 TLD 조회 → `for await of` 진행 스트리밍
- [ ] `src/tui/`: Ink 컴포넌트 구현 (App/SearchResults/RegistrarModal/Spinner)
- [ ] `src/registrar/`: 4개 URL 매핑 + `child_process.spawn` 브라우저 오픈
- [ ] `src/mcp/server.ts`: MCP TS SDK + Zod 스키마 + StdioTransport
- [ ] `src/index.ts`: commander로 `search`/`mcp`/`init` 서브커맨드 연결
- [ ] `src/config/`: config/history/watchlist JSON 로드/저장 (Bun.file API)
- [ ] `src/theme/`: Temper Forge 팔레트 우선 구현
- [ ] `build.ts`: `bun build --compile` 5개 플랫폼 스크립트
- [ ] `.github/workflows/release.yml` + `homebrew-temper` tap 레포 생성
- [ ] 릴리스 태그(v0.1.0) 푸시 → 자동 GitHub Releases + Homebrew 배포
- [ ] README 작성 (temper.domains 랜딩 겸용)

### Phase 2 — 확장 + 구매 API (2주)
- [ ] Extended 64개 TLD (`--extended` 플래그)
- [ ] Custom TLD (`--tlds=` 플래그)
- [ ] Porkbun API 또는 Vercel API 직접 구매 연동
- [ ] 조합어 자동 생성
- [ ] 검색 히스토리
- [ ] Watchlist + 알림
- [ ] Hacker News "Show HN" 게시

### Phase 3 — 데스크탑 앱 + 원격 MCP (4주)

**TUI 코어 재사용 (철학 유지)**
- [ ] TypeScript 코어(`src/checker`, `src/registrar`, `src/config`) Tauri 프론트엔드에서 재사용
- [ ] TUI 기본 기능 이식 (검색, 레지스트라 선택, Watchlist, History, 조합어)
- [ ] 키보드 우선 UX 유지 (`Cmd+K` command palette)
- [ ] 같은 `~/.temper/` 디렉토리 공유 (CLI ↔ GUI 데이터 일치)

**GUI 확장 기능 (TUI에 없는 것)**
- [ ] macOS 메뉴바 아이콘 + 퀵 검색
- [ ] 전역 단축키 (`Cmd+Shift+D` 어디서든 검색)
- [ ] 시스템 알림 (Watchlist 도메인 풀릴 시)
- [ ] 멀티 탭 (여러 이름 동시 비교)
- [ ] 사이드바이사이드 비교 뷰
- [ ] 드래그 & 드롭 (브라우저/에디터에서 이름 끌어오기)
- [ ] Claude Desktop MCP 원클릭 활성화 (설정 파일 수동 편집 불필요)

**배포 + 수익화**
- [ ] $29 일회성 결제 (구독 아님)
- [ ] Mac App Store 또는 직접 배포 (Gumroad/Lemon Squeezy)
- [ ] 원격 MCP 서버 배포 (https://mcp.temper.domains) — Claude.ai 웹에서도 사용 가능

---

## 9. 리스크

| 리스크 | 대응 |
|--------|------|
| whois rate limit (레지스트리별) | 같은 서버 중복 쿼리 최소화, 3초 타임아웃, `pLimit(20)` |
| 일부 TLD RDAP 서버 매우 느림 (.top 6초 등) | Progressive rendering + 3초 타임아웃으로 UX 차단 |
| IANA bootstrap 서버 다운 | 로컬 캐싱 (`~/.temper/cache/rdap-dns.json`, 7일 TTL), 하드코딩 폴백 |
| 레지스트라 구매 URL 구조 변경 | 하드코딩 대신 설정(`~/.temper/config.json`)으로 관리 |
| whoiser availability 판단 없음 | Temper가 직접 `detectStatus()` 구현, TLD별 패턴 매칭 |
| Bun 바이너리 크기 (60~100MB) | Homebrew 다운로드는 1회성, 사용자 체감 미미. `--minify --bytecode` 적용 |
| Bun 런타임 미성숙 | node:net/http/fs 모두 🟢 Fully implemented 확인됨. Claude Code가 동일 스택 |
| MCP SDK 빠른 버전 업 | 공식 SDK 사용으로 breaking change 대응. pin version |
| 수익 모델 불확실성 | MVP는 커뮤니티 확보 우선, 수익은 Phase 3 데스크탑 앱($29)로 집중 |
| .domains TLD 인지도 낮음 | 오픈소스 특성상 URL 공유로 자연스럽게 노출 |

---

## 10. 참고 자료

### 표준 / 프로토콜
- [IANA RDAP Bootstrap](https://data.iana.org/rdap/dns.json) — TLD별 RDAP 서버 매핑 (RFC 9224)
- [ICANN gTLD RDAP Profile](https://www.icann.org/gtld-rdap-profile) — RDAP 표준 명세
- [MCP 공식 문서](https://modelcontextprotocol.io) — Model Context Protocol 스펙

### 런타임 / 빌드
- [Bun](https://bun.sh) — 런타임 + 번들러 + 테스트 (Anthropic 인수 2025-12)
- [Bun Compile Docs](https://bun.sh/docs/bundler/executables) — 단일 실행파일 크로스 플랫폼 빌드
- [Bun Anthropic Announcement](https://bun.sh/blog/bun-joins-anthropic) — 2025-12-02 인수 발표
- [Bun Node.js APIs](https://bun.sh/docs/runtime/nodejs-apis) — 호환성 매트릭스

### TypeScript 라이브러리 (공식 문서 확인 완료)
- [MCP TypeScript SDK (공식)](https://github.com/modelcontextprotocol/typescript-sdk) — v1.29, 12.1k stars, Zod 통합
- [MCP TS SDK Server Docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — 서버 구현 가이드
- [Ink](https://github.com/vadimdemedes/ink) — React for terminal, v6.8+, 37.2k stars, **Claude Code 사용**
- [Ink Examples](https://github.com/vadimdemedes/ink#examples) — 실전 사용 예시
- [commander](https://github.com/tj/commander.js) — CLI 프레임워크, 28.1k stars, 네이티브 TypeScript
- [whoiser](https://github.com/LayeredStudio/whoiser) — whois 클라이언트, 265 stars, TLD 서버 자동 발견, 100% TS
- [zod](https://github.com/colinhacks/zod) — TypeScript-first 스키마 검증, MCP SDK 통합
- [p-limit](https://github.com/sindresorhus/p-limit) — Promise 동시성 제어

### 표준 / 프로토콜
- [IANA RDAP Bootstrap](https://data.iana.org/rdap/dns.json) — TLD별 RDAP 서버 매핑 (RFC 9224)
- [ICANN gTLD RDAP Profile](https://www.icann.org/gtld-rdap-profile) — RDAP 표준 명세
- [MCP 공식 문서](https://modelcontextprotocol.io) — Model Context Protocol 스펙
- [Claude Code 기술 스택](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built) — Bun + TypeScript + Ink + Yoga

### 데스크탑 앱 (Phase 3)
- [Tauri](https://tauri.app) — CLI 코어 재사용 + Rust/WebView

### 레지스트라 API (Phase 2+)
- [Cloudflare Registrar](https://domains.cloudflare.com)
- [Porkbun API 문서](https://porkbun.com/api/json/v3/documentation)
- [Namecheap API 문서](https://www.namecheap.com/support/api/intro/)
- [Vercel Registrar API](https://vercel.com/docs/domains/registrar-api)

### 참고
- [instantdomainsearch.com](https://instantdomainsearch.com) — UX 벤치마크 (자체 DB 기반 서비스)
- [Localhoston](https://localhoston.com) — 동일 창업자의 관련 제품
