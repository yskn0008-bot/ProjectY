#!/usr/bin/env bash
set -euo pipefail

if ! command -v convert >/dev/null || ! command -v compare >/dev/null; then
  echo "ImageMagick (convert/compare) is required." >&2
  exit 2
fi

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
shots_dir="${1:-$repo_root/test-results}"
output_dir="${2:-$repo_root/test-results/visual-pixel-match}"
ssot="$repo_root/yos/visual-ssot/my-way-five-domains-roadmap-final.jpeg"
mkdir -p "$output_dir"

names=(home life money journey idea)
# Crop only the app surface. The SSOT includes an illustrated iPhone bezel and
# native status bar, while Playwright captures the web viewport itself.
crops=("244x445+25+145" "256x445+315+145" "234x445+612+145" "234x445+888+145" "181x445+1168+145")
shots=("yos-home-390-chromium.png" "life-home-390-chromium.png" "yos-money-390-chromium.png" "yos-journey-390-chromium.png" "yos-idea-390-chromium.png")

report="$output_dir/metrics.tsv"
printf 'screen\tcolor_rmse\tedge_rmse\n' > "$report"

for index in "${!names[@]}"; do
  name="${names[$index]}"
  shot="$shots_dir/${shots[$index]}"
  if [[ ! -f "$shot" ]]; then
    echo "Missing screenshot: $shot" >&2
    exit 3
  fi
  convert "$ssot" -crop "${crops[$index]}" +repage -resize 390x844\! "$output_dir/$name-reference.png"
  convert "$shot" -resize 390x844\! "$output_dir/$name-actual.png"
  metric="$(compare -metric RMSE "$output_dir/$name-reference.png" "$output_dir/$name-actual.png" "$output_dir/$name-difference.png" 2>&1 || true)"
  convert "$output_dir/$name-reference.png" -colorspace Gray -edge 1 -blur 0x1 "$output_dir/$name-reference-edges.png"
  convert "$output_dir/$name-actual.png" -colorspace Gray -edge 1 -blur 0x1 "$output_dir/$name-actual-edges.png"
  edge_metric="$(compare -metric RMSE "$output_dir/$name-reference-edges.png" "$output_dir/$name-actual-edges.png" "$output_dir/$name-edge-difference.png" 2>&1 || true)"
  convert "$output_dir/$name-reference.png" "$output_dir/$name-actual.png" -alpha set -channel A -evaluate set 50% +channel -compose over -composite "$output_dir/$name-overlay.png"
  printf '%s\t%s\t%s\n' "$name" "$metric" "$edge_metric" >> "$report"
done

roadmap_shot="$shots_dir/yos-roadmap-panorama-chromium.png"
if [[ -f "$roadmap_shot" ]]; then
  convert "$ssot" -crop 1520x400+8+612 +repage -resize 1520x400\! "$output_dir/roadmap-reference.png"
  convert "$roadmap_shot" -resize 1520x400\! "$output_dir/roadmap-actual.png"
  metric="$(compare -metric RMSE "$output_dir/roadmap-reference.png" "$output_dir/roadmap-actual.png" "$output_dir/roadmap-difference.png" 2>&1 || true)"
  convert "$output_dir/roadmap-reference.png" -colorspace Gray -edge 1 -blur 0x1 "$output_dir/roadmap-reference-edges.png"
  convert "$output_dir/roadmap-actual.png" -colorspace Gray -edge 1 -blur 0x1 "$output_dir/roadmap-actual-edges.png"
  edge_metric="$(compare -metric RMSE "$output_dir/roadmap-reference-edges.png" "$output_dir/roadmap-actual-edges.png" "$output_dir/roadmap-edge-difference.png" 2>&1 || true)"
  convert "$output_dir/roadmap-reference.png" "$output_dir/roadmap-actual.png" -alpha set -channel A -evaluate set 50% +channel -compose over -composite "$output_dir/roadmap-overlay.png"
  printf 'roadmap\t%s\t%s\n' "$metric" "$edge_metric" >> "$report"
fi

cat "$report"
