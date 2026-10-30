#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p vendor/three
curl -fL -o vendor/three/three.module.js https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js
echo "XONG. Kich thuoc file (phai > 1000000 bytes):"
ls -l vendor/three
