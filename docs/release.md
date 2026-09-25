# Release Guide

## Prerequisites

- v0.7.0 is the first AGPL release. Do not overwrite v0.6.2 or earlier
  Apache artifacts. Announce `AGPL-3.0-only` and link `docs/licensing.md`
  in the v0.7.0 release notes.
- Review `legal/inventory.json` for the actual artifact/platform. The complete
  Bun linked-library notices and source/relink review is still open; no license
  incompatibility or violation has been established by that open status.
  Do not mark a runtime reviewed merely because its build succeeds. Dependency upgrades require a
  refreshed inventory and preserved notices.
- Public packaging sets `TEMPER_PUBLIC_BUILD=1`, checks the actual Git commit
  against the deployment commit and rejects changes to included source inputs,
  listing those paths. Unrelated files outside the source archive do not block it.
  Ordinary compilation needs neither Git nor release metadata. Source archives
  are generated during packaging, once per package rather than before/after
  compilation. Native packages retain the compiler's recorded Bun version;
  the packager does not need to use the same version.
  The website instead uses `VERCEL_GIT_COMMIT_SHA` (or `GITHUB_SHA` in CI) for its
  source link without requiring a clean Git working directory. Other public hosts
  set `TEMPER_PUBLIC_BUILD=1`; without deployment metadata, the website reads the
  checkout's HEAD. A missing or invalid revision is reported rather than inventing
  a source link. Local dirty previews remain labeled as unpublished.
  Vercel's `.vercel/` project metadata and output are ignored and excluded from
  source archives. Web CI builds in public mode.

- Run `bun ci`. No exact Bun or Node.js version is required for local
  verification; record the versions used. Release workflows select Bun
  `latest` and Node.js `lts/*`.
- The npm minimum is Node.js 22.12.0, as already declared by the published
  v0.6.2 package. Standalone binary users do not need to install Node.js.
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

1. **verify** - `bun test`, `bun run typecheck`, `bun run docs:check`, `npm pack`; 게시할 npm tgz와 corresponding-source archive 생성
2. **source** - GitHub Release 생성/확인, 실제 commit의 source archive 공개 및 파일 hash 확인. 한 번 내려받아 한 번 압축 해제하여 대조.
3. **build / npm** - source 성공 뒤 독립 실행. npm은 verify가 만든 동일 tgz를 OIDC로 게시하며 다시 빌드하지 않음. 바이너리는 5개 플랫폼으로 빌드 (`PKG_VERSION`은 태그 버전으로 주입)
   - bun-darwin-arm64, bun-darwin-x64
   - bun-linux-x64, bun-linux-arm64
   - bun-windows-x64
4. **release** - 성공한 바이너리 `tar.gz` 업로드
5. **homebrew** - `jongjinchoi/homebrew-temper-domains` Formula 자동 업데이트

Source 공개가 바이너리보다 먼저 완료될 수 있다. 채널별 결과를 따로 확인한다.
Native 실패는 npm 게시를 중단하지 않으며, source 실패는 두 채널 모두 중단한다.
Homebrew는 native 배포 성공 뒤에만 갱신한다. 동일 npm 버전이 이미 있으면
tgz integrity가 같을 때 재게시를 생략하고, 다르면 실패 이유를 보고한다.
기존 버전/산출물을 덮어쓰거나 일부 성공을 전체 배포 완료로 보고하지 않는다.

## Recover npm Publication

GitHub Release가 이미 게시됐지만 npm 게시만 실패한 경우 기존 태그를 이동하거나
삭제하지 않는다. 워크플로우 변경이 없다면 실패한 npm job을 재실행할 수 있다.
워크플로우 자체를 수정했다면 기존 실행의 재실행에는 수정이 적용되지 않으므로,
수정된 `main`의 수동 실행을 사용한다.

```bash
gh workflow run release.yml --ref main -f release_tag=v0.4.0
```

수동 실행은 verify와 npm job만 수행하며 바이너리·Homebrew를 재게시하지 않는다.
기존 공개 GitHub Release에 복구 빌드의 실제 커밋을 담은 소스 archive를 추가한다.
기존 태그 빌드의 소스 archive를 덮어쓰지 않는다. 입력 태그와 package.json 버전이 같고, 태그가 현재 커밋의
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

Before publication, inspect the actual npm tarball and all five native archives:

- npm contains `LICENSE`, `THIRD_PARTY_NOTICES.md`, the linked user guides and
  `dist/npm/SOURCE.md`; no private environment files or developer notes.
- Native archives contain `temper` (Windows: `temper.exe`) plus `LICENSE`,
  `THIRD_PARTY_NOTICES.md` and the build-specific `SOURCE.md`.
- `temper-source-<actual-commit>.tar.gz` contains the source, lockfile, build
  scripts, saved catalog inputs and `SOURCE-MANIFEST.json`. Extract it and check
  the recorded hashes and a rebuild. A locally successful snapshot is not proof
  that the public download URL works: verify that URL after release upload and
  before npm publication.
- Homebrew's generated formula declares `AGPL-3.0-only` and installs the three
  legal/source files with `pkgshare.install`.
- The deployed website shows a Source link to the exact build commit, readable
  `/license/` and `/notices/` responses, matching FAQ/JSON-LD/llms labels. A local
  dirty preview instead displays `local source · unpublished`.

Local package checks do not publish or update the maintainer's installation:

```sh
bun run build:npm
npm pack --dry-run
npm pack --pack-destination /path/to/temporary-directory
bun run build.ts bun-darwin-arm64
bun run scripts/source-package.ts bun-darwin-arm64
```

Check npm publication and the Homebrew formula separately: the CLI updater uses
each installation channel's published version, not GitHub release presence alone.
The formula's explicit stable `version` field is the read-only discovery contract.
If that format changes, update the strict parser in `src/update/versions.ts` too.
Older installed releases do not show an update prompt until users install a
release containing the updater through their existing installation method.

Updater regression tests use temporary homes/install roots and fake package
managers. Actual upgrades must use a disposable installation, never the maintainer's
global installation as a test fixture. Verify terminal recovery after success,
failure and cancellation, and confirm MCP/JSON/offline commands make no version requests.

An opt-in full installation harness is available separately from `bun test`:

```bash
TEMPER_REAL_INSTALL=1 node tests/update/real-install.mjs npm <test-start-version> <expected-target-version>
TEMPER_REAL_INSTALL=1 TEMPER_TEST_UNTRUSTED_TAPS=1 node tests/update/real-install.mjs homebrew <test-start-version> <expected-target-version> /path/to/brew /path/to/temper-bun-darwin-arm64.tar.gz <published-sha256>
```

This fixture tests this checkout with an explicitly supplied test-only start version
against an explicitly expected published target. It is not an old release binary.
Preflight checks the published version, archive integrity and package/binary version;
the PTY approves only the exact start/target pair and cancels a changed Homebrew target.
It does not change package.json or publish a version. It queries
the real version endpoints and installs real packages in new temporary prefixes.
Homebrew requires macOS ARM64, an existing Homebrew checkout with portable Ruby,
and the verified target archive, served unchanged from a loopback mirror. Its
nondefault-prefix warnings remain visible. Optional untrusted taps are empty
local test repositories; they do not change the user's tap trust settings.
`TEMPER_TEST_THEME=rose-pine-dawn` selects the alternate theme for the fixture.
Retained evidence includes the source hashes, raw PTY output, timed cast and final
version result. Do not share `session.json`: it contains the inherited environment.
The test never upgrades the maintainer's global installation. A newly installed
updater controls subsequent upgrades; it cannot change the screen already shown
by the older updater that installed it.

```bash
# GitHub Release
gh release view v<version>

# npm
npm info temper-domains version

# Homebrew
brew update && brew upgrade temper
temper --version
```

## Recovery and publication removal

```bash
# npm unpublish (check eligibility under the current npm policy first)
npm unpublish temper-domains@<version>

# GitHub Release 삭제
gh release delete v<version> --yes

# 태그 삭제
git tag -d v<version>
git push origin :refs/tags/v<version>
```

These are publication removals, not rollbacks of users' installed packages.
Under [npm's unpublish policy](https://docs.npmjs.com/policies/unpublish/), removal
within 72 hours requires no dependents; after that, additional download and
ownership conditions apply. An unpublished name/version cannot be reused.
Prefer a corrected release when users already depend on the published version;
any removal still requires explicit authorization.

## Notes

- **package.json version과 태그를 반드시 일치시킬 것** — npm은 package.json version으로 게시
- npm 게시에는 장기 토큰이 필요하지 않으며 GitHub Actions의 OIDC 인증을 사용한다.
- 현재 릴리스 워크플로우는 `.github/workflows/release.yml`을 기준으로 한다
