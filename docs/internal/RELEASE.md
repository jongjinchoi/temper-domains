# Release Guide

## Prerequisites

- GitHub Secrets 설정 완료
  - `NPM_TOKEN`: npm Granular Access Token (Read/Write + 2FA bypass)
  - `HOMEBREW_TAP_TOKEN`: GitHub PAT (repo write, homebrew-temper-domains 접근)

## Release Steps

```bash
# 1. package.json version 수정
# ex) 0.1.1 → 0.2.0

# 2. 커밋
git add package.json
git commit -m "chore: bump version to 0.2.0"

# 3. 태그 생성 + 푸시
git tag v0.2.0
git push origin main --tags
```

태그 푸시 후 GitHub Actions가 자동 실행:

1. **typecheck** — `bunx tsc --noEmit`
2. **build** — 5개 플랫폼 바이너리 (PKG_VERSION 자동 주입)
   - bun-darwin-arm64, bun-darwin-x64
   - bun-linux-x64, bun-linux-arm64
   - bun-windows-x64
3. **release** — GitHub Release 생성 + tar.gz 업로드
4. **npm** — `npm publish --access public` (temper-domains@0.2.0)
5. **homebrew** — homebrew-temper-domains Formula 자동 업데이트 (version, url, sha256)

## Verify

```bash
# GitHub Release
gh release view v0.2.0

# npm
npm info temper-domains version

# Homebrew
brew update && brew upgrade temper
temper --version
```

## Rollback

```bash
# npm unpublish (72시간 이내만 가능)
npm unpublish temper-domains@0.2.0

# GitHub Release 삭제
gh release delete v0.2.0 --yes

# 태그 삭제
git tag -d v0.2.0
git push origin :refs/tags/v0.2.0
```

## Notes

- **package.json version과 태그를 반드시 일치시킬 것** — npm은 package.json version으로 게시
- npm 토큰은 90일 만료 — 주기적 갱신 필요
- `softprops/action-gh-release@v2`는 아직 Node 24 미지원 (2026년 6월 이전 업데이트 예상)
