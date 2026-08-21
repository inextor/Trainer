#!/usr/bin/env python3
"""
OCR Executor - Processes images through mimo-v2.5 and saves text output
Generates batch files for parallel processing
"""

import os
import json
from pathlib import Path

OCR_DIR = Path("/var/www/html/Trainer/ocr-output")
BATCH_DIR = Path("/var/www/html/Trainer/ocr-batches")
OUTPUT_DIR = Path("/var/www/html/Trainer/ocr-text")


def create_batches(batch_size=10):
    """Split images into batches for parallel processing"""
    manifest_file = OCR_DIR / "manifest.json"
    with open(manifest_file) as f:
        manifest = json.load(f)
    
    BATCH_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    files = [item["file"] for item in manifest["files"] if item["status"] == "queued"]
    
    batches = []
    for i in range(0, len(files), batch_size):
        batch = files[i:i + batch_size]
        batch_id = i // batch_size + 1
        batch_file = BATCH_DIR / f"batch_{batch_id:03d}.json"
        
        with open(batch_file, "w") as f:
            json.dump({
                "batch_id": batch_id,
                "files": batch,
                "status": "pending"
            }, f, indent=2)
        
        batches.append({"id": batch_id, "file": str(batch_file), "count": len(batch)})
    
    print(f"Created {len(batches)} batches of {batch_size} images each")
    return batches


def create_processing_script():
    """Create the main processing script"""
    script = '''#!/usr/bin/env python3
"""
Process a batch of images through mimo-v2.5
Usage: python3 process_batch.py <batch_file>
"""

import sys
import json
import base64
from pathlib import Path


def process_batch(batch_file):
    """Process all images in a batch"""
    with open(batch_file) as f:
        batch = json.load(f)
    
    output_dir = Path("/var/www/html/Trainer/ocr-text")
    output_dir.mkdir(exist_ok=True)
    
    results = []
    for filename in batch["files"]:
        image_path = Path("/var/www/html/Trainer/libro") / filename
        
        if not image_path.exists():
            print(f"  ✗ {filename} - file not found")
            results.append({"file": filename, "status": "error", "error": "not found"})
            continue
        
        # Read and encode image
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")
        
        # Create OCR prompt
        prompt = """Extract ALL text from this image exactly as it appears. This is a page from a running training book.

Rules:
1. Extract every word, number, and character visible
2. Preserve table structures using markdown table format
3. Keep page numbers
4. Maintain formatting (headers, lists, etc.)
5. If text is unclear, mark with [unclear]
6. Do NOT add any commentary - just extract the text

Output ONLY the extracted text, nothing else."""
        
        # Build API request
        api_request = {
            "model": "opencode-go/mimo-v2.5",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
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
        
        # Save request
        output_file = output_dir / f"{filename.replace('.jpg', '.json')}"
        with open(output_file, "w") as f:
            json.dump({
                "source": str(image_path),
                "filename": filename,
                "api_request": api_request,
                "status": "pending"
            }, f, indent=2)
        
        print(f"  ✓ {filename}")
        results.append({"file": filename, "status": "queued", "output": str(output_file)})
    
    return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 process_batch.py <batch_file>")
        sys.exit(1)
    
    batch_file = sys.argv[1]
    print(f"Processing batch: {batch_file}")
    results = process_batch(batch_file)
    print(f"Done: {len([r for r in results if r['status'] == 'queued'])} queued")
'''
    
    script_path = Path("/var/www/html/Trainer/agents/process_batch.py")
    with open(script_path, "w") as f:
        f.write(script)
    
    print(f"Created processing script: {script_path}")


if __name__ == "__main__":
    batches = create_batches(10)
    create_processing_script()
    print("\nNext steps:")
    print("1. Run: python3 agents/process_batch.py <batch_file>")
    print("2. Or use Task tool to process images directly")