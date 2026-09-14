import type { InspectionResult, DOMIssue } from "./dom-inspector";

export interface LLMAnalysis {
  summary: string;
  issues: Array<{
    file: string;
    line?: number;
    problem: string;
    severity: string;
    fix: {
      description: string;
      cssChanges?: string;
      htmlChanges?: string;
      fileEdits: Array<{
        filePath: string;
        oldContent: string;
        newContent: string;
      }>;
    };
  }>;
  overallScore: number;
  recommendations: string[];
}

export interface FeedbackInput {
  inspectionResult: InspectionResult;
  screenshotBase64?: string;
  projectFiles?: Array<{
    path: string;
    content: string;
  }>;
}

function buildInspectionContext(result: InspectionResult): string {
  const lines: string[] = [];

  lines.push(`## Page Metrics`);
  lines.push(`- Total DOM elements: ${result.pageMetrics.totalElements}`);
  lines.push(`- Visible elements: ${result.pageMetrics.visibleElements}`);
  lines.push(`- Interactive elements: ${result.pageMetrics.interactiveElements}`);
  lines.push("");

  if (result.issues.length > 0) {
    lines.push(`## Detected Issues (${result.issues.length})`);
    for (const issue of result.issues) {
      lines.push(
        `[${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`
      );
      lines.push(`  Selector: ${issue.selector}`);
      if (issue.boundingBox) {
        lines.push(
          `  Position: x=${issue.boundingBox.x.toFixed(0)}, y=${issue.boundingBox.y.toFixed(0)}, w=${issue.boundingBox.width.toFixed(0)}, h=${issue.boundingBox.height.toFixed(0)}`
        );
      }
      lines.push(`  Suggested fix: ${issue.suggestedFix}`);
      lines.push("");
    }
  } else {
    lines.push("## No Issues Detected");
    lines.push("The automated DOM inspection found no visual issues.");
  }

  return lines.join("\n");
}

function buildFileContext(
  files: Array<{ path: string; content: string }>
): string {
  const lines: string[] = ["## Project Files (Relevant CSS/HTML/JSX)"];

  for (const file of files.slice(0, 15)) {
    lines.push(`\n### ${file.path}`);
    lines.push("```");
    lines.push(file.content.slice(0, 5000));
    lines.push("```");
  }

  return lines.join("\n");
}

export function buildAnalysisPrompt(input: FeedbackInput): string {
  const sections: string[] = [
    "# Visual Design Validation Analysis",
    "",
    "You are analyzing a web page for visual design issues. An automated DOM inspection has been performed and the results are below.",
    "",
    buildInspectionContext(input.inspectionResult),
  ];

  if (input.projectFiles && input.projectFiles.length > 0) {
    sections.push("");
    sections.push(buildFileContext(input.projectFiles));
  }

  if (input.screenshotBase64) {
    sections.push("");
    sections.push(
      "A screenshot of the page has been captured. Analyze it for visual issues that the DOM inspection might have missed, such as:"
    );
    sections.push("- Visual misalignment not detectable via DOM");
    sections.push("- Color contrast problems");
    sections.push("- Text truncation or wrapping issues");
    sections.push("- Visual hierarchy problems");
    sections.push("- Inconsistent spacing or sizing");
  }

  sections.push("");
  sections.push("## Required Output Format");
  sections.push("");
  sections.push(
    "Respond with a JSON object (no markdown fences) matching this structure:"
  );
  sections.push("```json");
  sections.push(`{
  "summary": "Brief overall assessment",
  "overallScore": 0-100,
  "issues": [
    {
      "file": "path/to/file.css",
      "line": 42,
      "problem": "Description of the issue",
      "severity": "critical|warning|info",
      "fix": {
        "description": "What needs to change",
        "cssChanges": "The actual CSS code to apply",
        "htmlChanges": "Any HTML changes needed (if applicable)",
        "fileEdits": [
          {
            "filePath": "path/to/file.css",
            "oldContent": "exact existing code to replace",
            "newContent": "replacement code"
          }
        ]
      }
    }
  ],
  "recommendations": ["General improvement suggestions"]
}`);
  sections.push("```");
  sections.push("");
  sections.push(
    "IMPORTANT: Provide concrete, specific file edits with exact old/new content. Be precise with CSS selectors and property values."
  );

  return sections.join("\n");
}

export function parseLLMResponse(response: string): LLMAnalysis | null {
  try {
    let cleaned = response.trim();

    const jsonMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      cleaned = jsonMatch[1];
    }

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(cleaned);

    if (!parsed.summary || typeof parsed.overallScore !== "number") {
      return null;
    }

    return {
      summary: parsed.summary,
      overallScore: Math.max(0, Math.min(100, parsed.overallScore)),
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((issue: any) => ({
            file: issue.file || "",
            line: issue.line,
            problem: issue.problem || "",
            severity: issue.severity || "info",
            fix: {
              description: issue.fix?.description || "",
              cssChanges: issue.fix?.cssChanges,
              htmlChanges: issue.fix?.htmlChanges,
              fileEdits: Array.isArray(issue.fix?.fileEdits)
                ? issue.fix.fileEdits.map((edit: any) => ({
                    filePath: edit.filePath || "",
                    oldContent: edit.oldContent || "",
                    newContent: edit.newContent || "",
                  }))
                : [],
            },
          }))
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [],
    };
  } catch {
    return null;
  }
}

export function buildRetryPrompt(
  previousAnalysis: LLMAnalysis,
  failedEdits: string[]
): string {
  return [
    "# Retry: Previous fixes failed validation",
    "",
    `The previous analysis scored ${previousAnalysis.overallScore}/100.`,
    "",
    "## Failed edits:",
    ...failedEdits.map((e) => `- ${e}`),
    "",
    "Please provide alternative fixes. Focus on:",
    "1. Simpler CSS-only changes that don't require structural HTML changes",
    "2. More conservative fixes that are less likely to break existing functionality",
    "3. Verify the oldContent matches exactly what is in the file",
    "",
    "Respond with the same JSON format as before.",
  ].join("\n");
}
