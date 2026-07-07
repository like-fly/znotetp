#!/bin/sh
set -e

BASE_DIR=$(pwd)
PUBLIC_DIR="$BASE_DIR/public"
DIST_DIR="$BASE_DIR/dist"
FRONTEND_DIR="$BASE_DIR/frontend"

rm -rf "$PUBLIC_DIR" "$DIST_DIR"
mkdir -p "$PUBLIC_DIR/static/assets"
mkdir -p "$PUBLIC_DIR/static/images"
mkdir -p "$PUBLIC_DIR/static/vditor"

cd "$FRONTEND_DIR"
bun run build
cd "$BASE_DIR"

cp -ar "$FRONTEND_DIR/dist/static/assets/." "$PUBLIC_DIR/static/assets/"
cp -ar "$FRONTEND_DIR/public/static/images/." "$PUBLIC_DIR/static/images/"
cp -ar "$FRONTEND_DIR/public/static/vditor/." "$PUBLIC_DIR/static/vditor/"

bun run output
