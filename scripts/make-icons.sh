#!/bin/sh
# Renders the PWA icons in public/icons/ from design/logo (item 04, #15).
# Needs rsvg-convert and ImageMagick.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/icons
rsvg-convert -w 192 -h 192 design/logo/barelysig-app-icon.svg -o public/icons/icon-192.png
rsvg-convert -w 512 -h 512 design/logo/barelysig-app-icon.svg -o public/icons/icon-512.png
# Maskable: the logo inside Android's safe zone, on the tile's own ink.
magick -size 512x512 xc:'#201e1d' \( public/icons/icon-512.png -resize 70% \) -gravity center -composite \
  public/icons/icon-maskable-512.png
