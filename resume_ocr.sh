#!/bin/bash
# Resume OCR Verification Script
# Run this in the new environment to continue verifying images

set -e

PROJECT_DIR="/var/www/html/Trainer"
LIBRO_DIR="$PROJECT_DIR/libro"
VERIFIED_DIR="$PROJECT_DIR/ocr-verified"

echo "=== OCR Verification ==="
echo ""

# Count images
TOTAL=$(ls "$LIBRO_DIR"/*.jpg 2>/dev/null | wc -l)
VERIFIED=$(ls "$VERIFIED_DIR"/*.md 2>/dev/null | wc -l)
REMAINING=$((TOTAL - VERIFIED))

echo "Total images: $TOTAL"
echo "Verified: $VERIFIED"
echo "Remaining: $REMAINING"
echo ""

# Find unverified images
echo "=== Unverified Images ==="
comm -23 \
  <(ls "$LIBRO_DIR"/*.jpg | xargs -I{} basename {} | sort) \
  <(ls "$VERIFIED_DIR"/*.md | xargs -I{} basename {} .md | sort) | head -20

echo ""
echo "=== How to Continue ==="
echo "1. Use the Task tool with subagent_type='general'"
echo "2. Process 15-30 images per batch"
echo "3. For each image: Read → Extract text → Save to $VERIFIED_DIR/"
echo ""
echo "Example Task prompt:"
echo '  "Process these images from the training book.'
echo '   For each: 1) Read the image 2) Extract ALL text'
echo '   3) Write to /var/www/html/Trainer/ocr-verified/[filename].md'
echo '   Images: /var/www/html/Trainer/libro/FILENAME.jpg"'
