# Release Guide

## Prerequisites

- Run `bun ci`. No exact Bun or Node.js version is required for local
  verification; record the versions used. Release workflows select Bun
  `latest` and Node.js `lts/*`.
- The npm minimum is Node.js 22.12.0. Announce the increase from the previous
  Node.js >= 18 declaration in the next release notes. Standalone binary users
  do not need to install Node.js.
- npm `temper-domains` Settings → Trusted Publisher에 GitHub Actions 등록:
  - Organization or user: `jongjinchoi`
  - Repository: `temper-domains`
  - Workflow filename: `release.yml` (전체 경로가 아닌 파일명)
  - Environment name: 비워두기
  - Allowed actions: `npm publish` 직접 게시 허용
- npm 게시 job은 `id-token: write`로 OIDC 인증하며 `NPM_TOKEN`을 사용하지 않는다.
  게시 환경은 Node.js >= 22.14.0, npm >= 11.5.1이 필요하다. 이는 사용자용
  npm CLI의 Node 최소 버전과 별개이다.
- GitHub Secret `HOMEBREW_TAP_TOKEN`: GitHub PAT
  (repo write, homebrew-temper-domains 접근).

## Release Steps

```bash
# 1. package.json version 수정
# ex) 0.2.2 → <next-version>

# 2. 커밋
git add package.json
git commit -m "chore: bump version to <next-version>"

# 3. 태그 생성 + 푸시
git tag v<next-version>
git push origin main --tags
```

태그 푸시 후 GitHub Actions가 자동 실행:

1. **verify** - `bun test`, `bun run typecheck`, `bun run build:npm`
2. **build** - 5개 플랫폼 바이너리 (`PKG_VERSION`은 태그 버전으로 주입)
   - bun-darwin-arm64, bun-darwin-x64
   - bun-linux-x64, bun-linux-arm64
   - bun-windows-x64
3. **release** - GitHub Release 생성 + `tar.gz` 업로드
4. **npm** - `bun run build:npm` 후 OIDC로 `npm publish --access public`
5. **homebrew** - `jongjinchoi/homebrew-temper-domains` Formula 자동 업데이트

## Recover npm Publication

GitHub Release가 이미 게시됐지만 npm 게시만 실패한 경우 기존 태그를 이동하거나
삭제하지 않는다. 워크플로우 변경이 없다면 실패한 npm job을 재실행할 수 있다.
워크플로우 자체를 수정했다면 기존 실행의 재실행에는 수정이 적용되지 않으므로,
수정된 `main`의 수동 실행을 사용한다.

```bash
gh workflow run release.yml --ref main -f release_tag=v0.4.0
```

수동 실행은 verify와 npm job만 수행하며 바이너리·GitHub Release·Homebrew를
재게시하지 않는다. 입력 태그와 package.json 버전이 같고, 태그가 현재 커밋의
조상이며, 태그 이후 변경이 `release.yml`과 이 문서뿐일 때만 게시를 허용한다.
이 조건을 만족하지 않으면 새 버전으로 정상 릴리스를 진행한다.

빌드는 워크플로우 실행 커밋에서 수행하므로 자동 생성되는 npm provenance의
소스 커밋과 실제 빌드 소스가 일치한다. 게시된 버전은 덮어쓰지 않으며,
재시도 전에 npm 레지스트리에서 해당 버전의 존재 여부를 확인한다.

전환 시에는 OIDC 게시 성공을 먼저 확인한 뒤, 불필요한 기존 자동화 토큰과
GitHub Secret을 정리하고 npm Publishing access에서 토큰 게시를 제한한다.
별도 승인이 없는 토큰 삭제나 계정 설정 변경은 자동으로 수행하지 않는다.

공식 근거: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/),
[GitHub workflow 재실행](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

## Verify

```bash
# GitHub Release
gh release view v<version>

# npm
npm info temper-domains version

# Homebrew
brew update && brew upgrade temper
temper --version
```

## Rollback

```bash
# npm unpublish (72시간 이내만 가능)
npm unpublish temper-domains@<version>

# GitHub Release 삭제
gh release delete v<version> --yes

# 태그 삭제
git tag -d v<version>
git push origin :refs/tags/v<version>
```

## Notes

- **package.json version과 태그를 반드시 일치시킬 것** — npm은 package.json version으로 게시
- npm 게시에는 장기 토큰이 필요하지 않으며 GitHub Actions의 OIDC 인증을 사용한다.
- 현재 릴리스 워크플로우는 `.github/workflows/release.yml`을 기준으로 한다
