---
name: visual-design-validator
description: Use when the user wants to validate the visual design of a web page, check for layout issues, take screenshots for comparison, inspect DOM for overlaps/spacing/accessibility issues, or auto-fix CSS/HTML visual problems. Trigger keywords: visual validation, design check, layout audit, screenshot compare, responsive check, visual testing, design QA, CSS audit, DOM inspection.
---

# Visual Design Validator

Automated visual design validation tool that bridges the gap between code and browser rendering through a closed feedback loop.

## Capabilities

1. **Browser Automation** - Launch headless Chromium via Playwright, navigate to a page, set viewport sizes, capture screenshots
2. **DOM Inspection** - Detect overlaps, overflow, tiny touch targets, missing alt text, uneven spacing, z-index conflicts, missing form labels
3. **LLM Feedback Loop** - Generate analysis prompts from inspection results for AI-powered visual issue detection
4. **Auto-Fixer** - Apply AI-recommended CSS/HTML fixes with backup and revert support

## Usage

### Quick Validation
When the user says "validate my page" or "check my design":
1. Ask for the URL (or use localhost if they have a dev server)
2. Use the `visual-validate` tool to run full inspection
3. Report findings with the formatted inspection report

### Screenshot Comparison
When the user says "take screenshots" or "check responsive":
1. Use the `visual-screenshot` tool with multiple viewports
2. Show file paths for generated screenshots

### DOM-Only Inspection
When the user says "check DOM" or "inspect layout":
1. Use the `dom-inspect` tool for quick DOM analysis

### Apply Fixes
When the user says "fix the issues" or "auto-fix design":
1. After validation, use the LLM analysis output
2. Use the `visual-fix` tool with the analysis JSON
3. Report applied fixes and any errors

## Workflow: Closed Feedback Loop

```
User Request
    |
    v
[1] Launch Browser + Navigate
    |
    v
[2] Take Screenshot + Inspect DOM
    |
    v
[3] Generate LLM Analysis Prompt
    |
    v
[4] AI Analyzes Issues (visual + structural)
    |
    v
[5] Apply Fixes to CSS/HTML Files
    |
    v
[6] Re-screenshot to Verify
    |
    v
[7] If score < 100%, loop back to [4]
```

## Viewport Presets
- **desktop**: 1920x1080
- **laptop**: 1366x768
- **tablet**: 768x1024
- **mobile**: 375x812

## Issues Detected
| Type | Severity | Description |
|------|----------|-------------|
| overlap | critical | Interactive elements overlapping |
| overflow | warning | Content overflowing containers |
| tiny-target | warning | Touch targets below 44px |
| missing-alt | critical | Images without alt text |
| uneven-spacing | info | Inconsistent element spacing |
| z-index-layering | warning | Conflicting z-index on overlapping elements |
| missing-label | critical | Form inputs without labels |
| text-contrast | warning | Low contrast text |

## Example Session

User: "Check my website at localhost:3000 for design issues"

Steps:
1. `visual-validate` with url="http://localhost:3000"
2. Review the inspection report
3. If issues found, generate LLM analysis
4. Apply fixes with `visual-fix`
5. Re-validate to confirm score is 100%
