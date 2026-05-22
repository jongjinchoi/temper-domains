# Release Guide

## Prerequisites

- GitHub Secrets 설정 완료
  - `NPM_TOKEN`: npm Granular Access Token (Read/Write + 2FA bypass)
  - `HOMEBREW_TAP_TOKEN`: GitHub PAT (repo write, homebrew-temper-domains 접근)

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

1. **typecheck** - `bunx tsc --noEmit`
2. **build** - 5개 플랫폼 바이너리 (`PKG_VERSION`은 태그 버전으로 주입)
   - bun-darwin-arm64, bun-darwin-x64
   - bun-linux-x64, bun-linux-arm64
   - bun-windows-x64
3. **release** - GitHub Release 생성 + `tar.gz` 업로드
4. **npm** - `bun run build:npm` 후 `npm publish --access public`
5. **homebrew** - `jongjinchoi/homebrew-temper-domains` Formula 자동 업데이트

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
- npm 토큰은 90일 만료 — 주기적 갱신 필요
- 현재 릴리스 워크플로우는 `.github/workflows/release.yml`을 기준으로 한다
