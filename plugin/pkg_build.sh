#!/bin/bash
# Build the SmokeSignal Unraid plugin package (.txz) from src/. Portable (uses
# tar, not Slackware makepkg) so it runs identically on GitHub CI and locally.
#
#   plugin/pkg_build.sh [VERSION]      # VERSION defaults to today (YYYY.MM.DD)
#
# Output: plugin/out/smokesignal-<version>.txz (+ .md5, + .sha256). The release
# workflow attaches the .txz (+ .md5) to the GitHub release "v<version>".
set -euo pipefail

VERSION="${1:-$(date +%Y.%m.%d)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
EMHTTP_REL="usr/local/emhttp/plugins/smokesignal"
OUT="$ROOT/plugin/out"
PKGROOT="$(mktemp -d)"
trap 'rm -rf "$PKGROOT"' EXIT

echo "==> assembling package tree"
cp -a "$SRC/." "$PKGROOT/"

# Brand ASCII banner: copy the shared house banner into the package (CR-stripped),
# the same way the container Dockerfiles do (see the vault ASCII Template).
# smokesignal-check.sh prints it as the header of its human-readable report.
echo "==> embedding brand banner"
tr -d '\r' < "$ROOT/.github/assets/banner-raw.txt" > "$PKGROOT/$EMHTTP_REL/banner.txt"

chmod +x "$PKGROOT/$EMHTTP_REL/smokesignal-check.sh"

# Normalise text files to LF. A CRLF .page breaks Unraid's PageBuilder (it splits
# the header on a pure-LF "\n---\n"), and a trailing CR breaks shell shebangs.
# Belt-and-suspenders next to .gitattributes, so a Windows/autocrlf checkout
# still produces a valid package.
echo "==> normalising text files to LF"
find "$PKGROOT" -type f ! -name '*.png' -print0 \
  | while IFS= read -r -d '' f; do perl -i -pe 's/\r\n/\n/g; s/\r$//' "$f"; done

mkdir -p "$OUT"
TXZ="$OUT/smokesignal-$VERSION.txz"
echo "==> packaging -> $TXZ"
# --force-local: a Windows output path like "D:/..." has a colon that GNU tar
# would otherwise read as a remote host[:path]. Harmless on Linux/CI.
# --owner/--group/--numeric-owner: force root:root on every entry INCLUDING
# "./", so upgradepkg (running as root) never applies the builder's uid to /.
tar --force-local --owner=0 --group=0 --numeric-owner -C "$PKGROOT" -caf "$TXZ" .

echo "==> checksums"
# cd into $OUT so the checksum files carry a bare filename, not the build path —
# otherwise `md5sum -c` / `sha256sum -c` fail for anyone who downloads them.
( cd "$OUT" && b="$(basename "$TXZ")" && md5sum "$b" | tee "$b.md5" && sha256sum "$b" | tee "$b.sha256" )
echo "done: $TXZ"
