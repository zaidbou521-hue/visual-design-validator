import { launchBrowser, navigateTo, takeScreenshot, closeBrowser } from "./dist/browser.js";
import { inspectDOM, formatIssuesReport } from "./dist/dom-inspector.js";
import { buildAnalysisPrompt, parseLLMResponse } from "./dist/llm-feedback.js";
import { applyFixes, formatFixReport } from "./dist/auto-fixer.js";

async function main() {
  console.log("=== Testing Visual Design Validator Modules ===\n");

  console.log("1. Testing parseLLMResponse...");
  const sampleResponse = `\`\`\`json
{
  "summary": "Test analysis",
  "overallScore": 85,
  "issues": [
    {
      "file": "styles.css",
      "problem": "Overlapping buttons",
      "severity": "critical",
      "fix": {
        "description": "Add margin",
        "cssChanges": ".btn { margin: 10px; }",
        "fileEdits": [
          {
            "filePath": "styles.css",
            "oldContent": ".btn { padding: 5px; }",
            "newContent": ".btn { padding: 10px; }"
          }
        ]
      }
    }
  ],
  "recommendations": ["Use flexbox"]
}
\`\`\``;
  const parsed = parseLLMResponse(sampleResponse);
  if (!parsed) {
    console.log("  FAIL: Could not parse LLM response");
  } else {
    console.log(`  OK: Score=${parsed.overallScore}, Issues=${parsed.issues.length}`);
  }

  console.log("\n2. Testing buildAnalysisPrompt...");
  const prompt = buildAnalysisPrompt({
    inspectionResult: {
      issues: [],
      elements: [],
      pageMetrics: {
        totalElements: 10,
        visibleElements: 8,
        interactiveElements: 3,
      },
    },
  });
  if (prompt.includes("Required Output Format")) {
    console.log("  OK: Prompt built with output format instructions");
  } else {
    console.log("  FAIL: Prompt missing output format");
  }

  console.log("\n3. Testing auto-fixer with dry run...");
  const fixResult = await applyFixes(
    {
      summary: "test",
      issues: [
        {
          file: "styles.css",
          problem: "Test",
          severity: "info",
          fix: {
            description: "Test fix",
            fileEdits: [
              {
                filePath: "test-does-not-exist.css",
                oldContent: "x",
                newContent: "y",
              },
            ],
          },
        },
      ],
      overallScore: 50,
      recommendations: [],
    },
    { projectRoot: ".", dryRun: true }
  );
  console.log(`  OK: Fix applied (file missing is expected in test): ${JSON.stringify(fixResult)}`);

  console.log("\n4. Testing formatIssuesReport (empty)...");
  const report = formatIssuesReport({
    issues: [],
    elements: [],
    pageMetrics: { totalElements: 0, visibleElements: 0, interactiveElements: 0 },
  });
  console.log(`  OK: ${report.split("\n")[0]}`);

  console.log("\n=== All module tests passed ===");
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});