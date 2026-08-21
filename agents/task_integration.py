#!/usr/bin/env python3
"""
Task Tool Integration for Image Describer
Shows how to integrate the image describer with the Task tool system.
"""

import json
from pathlib import Path


def create_task_prompt(image_path: str, detail_level: str = "detailed") -> str:
    """
    Create a prompt string suitable for the Task tool.
    
    This creates a prompt that can be used with:
    Task(
        description="Describe image",
        prompt=create_task_prompt("/path/to/image.jpg"),
        subagent_type="general"
    )
    """
    return f"""Analyze the image at {image_path} and provide a {detail_level} description.

Return your analysis as JSON with this structure:
{{
  "description": "Comprehensive description of the image",
  "objects_detected": ["list", "of", "objects"],
  "text_detected": "any visible text, or empty string",
  "scene_type": "indoor|outdoor|abstract|screenshot|other",
  "colors": ["dominant", "colors"],
  "mood": "overall mood",
  "confidence": 0.95
}}

Be specific about what you see in the image."""


def get_agent_config() -> dict:
    """Return the agent configuration for Task tool integration"""
    return {
        "name": "image_describer",
        "description": "Describes images using mimo-v2.5 model",
        "model": "opencode-go/mimo-v2.5",
        "capabilities": ["image_analysis", "ocr", "scene_understanding"],
        "input_types": ["image_path"],
        "output_types": ["json_description"],
        "task_tool_usage": {
            "subagent_type": "general",
            "example": """Task(
    description="Describe screenshot",
    prompt="Analyze the image at /var/www/html/Trainer/libro/Screenshot_20260819-073818.jpg and describe its contents in detail. Return JSON with description, objects_detected, text_detected, scene_type, colors, mood, and confidence fields.",
    subagent_type="general"
)"""
        }
    }


def main():
    """Print integration information"""
    print("=== Image Describer Task Tool Integration ===\n")
    
    config = get_agent_config()
    print("Agent Configuration:")
    print(json.dumps(config, indent=2))
    
    print("\n\nExample Task Tool Prompt:")
    print(create_task_prompt("/path/to/image.jpg"))
    
    print("\n\nTo use with Task tool:")
    print(config["task_tool_usage"]["example"])


if __name__ == "__main__":
    main()