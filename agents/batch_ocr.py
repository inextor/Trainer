#!/usr/bin/env python3
"""
Batch OCR Processor for training book screenshots
Uses opencode-go/mimo-v2.5 to extract text from images
"""

import os
import sys
import json
import base64
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configuration
SCREENSHOTS_DIR = Path("/var/www/html/Trainer/libro")
OUTPUT_DIR = Path("/var/www/html/Trainer/ocr-output")
BATCH_SIZE = 5  # Process 5 images at a time
MAX_RETRIES = 3


def get_sorted_screenshots():
    """Get all screenshots sorted by filename"""
    screenshots = list(SCREENSHOTS_DIR.glob("*.jpg"))
    screenshots.sort(key=lambda x: x.name)
    return screenshots


def encode_image(image_path: Path) -> str:
    """Encode image to base64"""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def create_ocr_prompt() -> str:
    """Create the OCR extraction prompt for mimo-v2.5"""
    return """Extract ALL text from this image exactly as it appears. This is a page from a running training book.

Rules:
1. Extract every word, number, and character visible
2. Preserve table structures using markdown table format
3. Keep page numbers
4. Maintain formatting (headers, lists, etc.)
5. If text is unclear, mark with [unclear]
6. Do NOT add any commentary - just extract the text

Output ONLY the extracted text, nothing else."""


def process_image(image_path: Path, retry=0) -> dict:
    """Process a single image through mimo-v2.5"""
    try:
        image_data = encode_image(image_path)
        
        # Build the API request for mimo-v2.5
        api_request = {
            "model": "opencode-go/mimo-v2.5",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": create_ocr_prompt()},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_data}"
                            }
                        }
                    ]
                }
            ],
            "temperature": 0.1,
            "max_tokens": 4000
        }
        
        # Save the request for later processing
        output_file = OUTPUT_DIR / f"{image_path.stem}.json"
        with open(output_file, "w") as f:
            json.dump({
                "source": str(image_path),
                "filename": image_path.name,
                "api_request": api_request,
                "status": "pending"
            }, f, indent=2)
        
        return {"file": image_path.name, "status": "queued", "output": str(output_file)}
        
    except Exception as e:
        if retry < MAX_RETRIES:
            time.sleep(1)
            return process_image(image_path, retry + 1)
        return {"file": image_path.name, "status": "error", "error": str(e)}


def main():
    """Main batch processing function"""
    screenshots = get_sorted_screenshots()
    print(f"Found {len(screenshots)} screenshots to process")
    
    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Process in batches
    results = []
    for i in range(0, len(screenshots), BATCH_SIZE):
        batch = screenshots[i:i + BATCH_SIZE]
        print(f"\nProcessing batch {i//BATCH_SIZE + 1}/{(len(screenshots) + BATCH_SIZE - 1)//BATCH_SIZE}")
        
        with ThreadPoolExecutor(max_workers=BATCH_SIZE) as executor:
            futures = {executor.submit(process_image, img): img for img in batch}
            for future in as_completed(futures):
                result = future.result()
                results.append(result)
                status = "✓" if result["status"] == "queued" else "✗"
                print(f"  {status} {result['file']}")
    
    # Save manifest
    manifest = {
        "total": len(screenshots),
        "processed": len([r for r in results if r["status"] == "queued"]),
        "errors": len([r for r in results if r["status"] == "error"]),
        "files": results
    }
    
    with open(OUTPUT_DIR / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    
    print(f"\nDone! {manifest['processed']}/{manifest['total']} queued")
    print(f"API requests saved to: {OUTPUT_DIR}")
    print(f"Run the actual API calls with: python3 execute_ocr.py")


if __name__ == "__main__":
    main()