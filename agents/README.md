# Image Describer Subagent

This directory contains an image description subagent powered by `opencode-go/mimo-v2.5`.

## Files

- `image_describer.md` - Agent configuration and documentation
- `describe_image.py` - Python implementation of the image describer
- `run_image_describer.sh` - Shell wrapper for easy invocation

## Quick Start

### Command Line
```bash
# Describe an image
./run_image_describer.sh /path/to/image.jpg

# Brief description
./run_image_describer.sh /path/to/image.jpg brief

# Detailed description
./run_image_describer.sh /path/to/image.jpg detailed
```

### Via Task Tool (OpenCode)
```python
Task(
    description="Describe image",
    prompt="Analyze the image at /var/www/html/Trainer/libro/Screenshot_20260819-073818.jpg and describe its contents in detail.",
    subagent_type="image_describer"
)
```

## Output Format

```json
{
  "description": "Natural language description of the image",
  "objects_detected": ["list", "of", "objects"],
  "text_detected": "any text found in the image",
  "scene_type": "indoor|outdoor|abstract|screenshot|other",
  "confidence": 0.95,
  "model": "opencode-go/mimo-v2.5",
  "detail_level": "detailed",
  "image_path": "/absolute/path/to/image.jpg"
}
```

## Model Information

- **Model**: opencode-go/mimo-v2.5
- **Capabilities**: Multimodal image understanding, OCR, scene analysis
- **Input**: Image files (JPG, PNG, etc.)
- **Output**: Structured JSON with description and metadata

## Integration

This agent can be integrated into workflows that need image analysis:
- Automated image cataloging
- Accessibility descriptions
- Content moderation
- Visual search assistance
- Documentation generation