#!/bin/bash
# Image Describer Agent Wrapper
# Uses opencode-go/mimo-v2.5 to describe images
#
# Usage:
#   ./run_image_describer.sh <image_path> [detail_level]
#
# Examples:
#   ./run_image_describer.sh /path/to/image.jpg
#   ./run_image_describer.sh /path/to/image.png detailed

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_PATH="${1:-}"
DETAIL_LEVEL="${2:-detailed}"

if [ -z "$IMAGE_PATH" ]; then
    echo "Error: Image path required"
    echo "Usage: $0 <image_path> [brief|detailed]"
    exit 1
fi

if [ ! -f "$IMAGE_PATH" ]; then
    echo "Error: Image file not found: $IMAGE_PATH"
    exit 1
fi

# Run the Python agent
python3 "$SCRIPT_DIR/describe_image.py" "$IMAGE_PATH" "$DETAIL_LEVEL"