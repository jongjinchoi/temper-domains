#!/usr/bin/env bash
set -euo pipefail
VERSION=${1:?version required}
BASE_URL=${2:?archive base URL required}
FORMULA=${3:?formula path required}
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
work=$(mktemp -d)
temporary_formula=$(mktemp "${FORMULA}.XXXXXX")
trap 'rm -rf "$work"; rm -f "$temporary_formula"' EXIT

# Exactly what the formula installs; keep in sync with nativeArchiveFiles in
# scripts/source-package.ts (scripts/homebrew-formula.test.ts checks both).
EXPECTED_FILES=$'LICENSE\nSOURCE.md\nTHIRD_PARTY_NOTICES.md\ntemper'

archive_sha() {
  local target=$1
  local archive="$work/$target.tar.gz"
  local listing
  curl --fail --show-error --silent --location --retry 3 --output "$archive" "$BASE_URL/temper-$target.tar.gz" || return $?
  listing=$(tar -tzf "$archive" | sed 's#^\./##' | LC_ALL=C sort) || return $?
  if [[ "$listing" != "$EXPECTED_FILES" ]]; then
    echo "Unexpected files in temper-$target.tar.gz:" >&2
    echo "$listing" >&2
    return 1
  fi
  # The mode column starts with "-" for a regular file; the owner must be able to execute it.
  tar -tvzf "$archive" temper | awk '$1 ~ /^-..x/ { ok = 1 } END { exit !ok }' || {
    echo "temper is not an executable regular file in temper-$target.tar.gz" >&2
    return 1
  }
  shasum -a 256 "$archive" | awk '{print $1}'
}
SHA_DARWIN_ARM64=$(archive_sha bun-darwin-arm64)
SHA_DARWIN_X64=$(archive_sha bun-darwin-x64)
SHA_LINUX_X64=$(archive_sha bun-linux-x64)
SHA_LINUX_ARM64=$(archive_sha bun-linux-arm64)

cat > "$temporary_formula" << EOF
class Temper < Formula
  desc "Never leave your terminal to find a domain"
  homepage "https://github.com/jongjinchoi/temper-domains"
  version "${VERSION}"
  license "AGPL-3.0-only"

  on_macos do
    if Hardware::CPU.arm?
      url "${BASE_URL}/temper-bun-darwin-arm64.tar.gz"
      sha256 "${SHA_DARWIN_ARM64}"
    else
      url "${BASE_URL}/temper-bun-darwin-x64.tar.gz"
      sha256 "${SHA_DARWIN_X64}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "${BASE_URL}/temper-bun-linux-arm64.tar.gz"
      sha256 "${SHA_LINUX_ARM64}"
    else
      url "${BASE_URL}/temper-bun-linux-x64.tar.gz"
      sha256 "${SHA_LINUX_X64}"
    end
  end

  def install
    bin.install "temper"
    pkgshare.install "LICENSE", "THIRD_PARTY_NOTICES.md", "SOURCE.md"
  end

  test do
    system "#{bin}/temper", "--version"
  end
end
EOF

mv "$temporary_formula" "$FORMULA"
