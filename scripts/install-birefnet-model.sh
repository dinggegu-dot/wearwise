#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
model="$root/public/models/birefnet/model_fp16.onnx"
expected_bytes=98484532
expected_sha=eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516
source_url='https://huggingface.co/studioludens/birefnet-lite-512/resolve/18d56c5/onnx/model_fp16.onnx'

verify() {
  local file="$1" bytes sha
  test -f "$file" || { echo "BiRefNet model missing: $file" >&2; return 1; }
  bytes="$(wc -c < "$file" | tr -d '[:space:]')"
  test "$bytes" = "$expected_bytes" || { echo "BiRefNet model size mismatch: $file" >&2; return 1; }
  if command -v sha256sum >/dev/null 2>&1; then
    sha="$(sha256sum "$file" | cut -d ' ' -f 1)"
  else
    sha="$(shasum -a 256 "$file" | cut -d ' ' -f 1)"
  fi
  test "$sha" = "$expected_sha" || { echo "BiRefNet model SHA-256 mismatch: $file" >&2; return 1; }
  echo "BiRefNet model verified: $file"
}

if test "${1:-}" = '--verify'; then
  test "$#" -eq 2 || { echo 'Usage: install-birefnet-model.sh --verify FILE' >&2; exit 2; }
  verify "$2"
  exit
fi
test "$#" -eq 0 || { echo 'Usage: install-birefnet-model.sh [--verify FILE]' >&2; exit 2; }
if test -f "$model"; then
  verify "$model"
  exit
fi

mkdir -p "$(dirname "$model")"
temporary="$(mktemp "$model.part.XXXXXX")"
trap 'rm -f "$temporary"' EXIT
curl --fail --location --retry 3 --retry-delay 2 --max-time 300 --output "$temporary" "$source_url"
verify "$temporary"
mv "$temporary" "$model"
trap - EXIT
verify "$model"
