# Image Describer Agent

## Description
A subagent that uses the opencode-go/mimo-v2.5 model to view images and provide detailed descriptions. This agent can analyze images and describe their contents, objects, scenes, text, and other visual elements.

## Model
- **Model ID**: `opencode-go/mimo-v2.5`
- **Capabilities**: Image understanding, visual description, OCR, scene analysis

## Usage
This agent accepts image file paths as input and returns a natural language description of the image content.

### Input Format
```json
{
  "image_path": "path/to/image.jpg",
  "detail_level": "brief|detailed",
  "focus": "general|text|objects|scene"
}
```

### Output Format
```json
{
  "description": "Natural language description of the image",
  "objects_detected": ["list", "of", "objects"],
  "text_detected": "any text found in the image",
  "confidence": 0.95
}
```

## Example Invocation
```bash
# Via Task tool with subagent_type
Task(
  description="Describe image",
  prompt="Analyze the image at /var/www/html/Trainer/libro/Screenshot_20260819-073818.jpg and provide a detailed description of its contents.",
  subagent_type="image_describer"
)
```

## Capabilities
- Scene description and context understanding
- Object detection and identification
- Text extraction (OCR) from images
- Color, composition, and style analysis
- Multi-image comparison when needed

## Configuration
The agent uses the mimo-v2.5 model which supports multimodal inputs including images. When describing images:
1. Load the image file
2. Process through mimo-v2.5 vision capabilities
3. Generate comprehensive description
4. Return structured output with description and metadata