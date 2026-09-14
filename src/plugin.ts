import type { Plugin } from "@opencode-ai/plugin";
import * as path from "path";
import { z } from "zod";
import {
  launchBrowser,
  navigateTo,
  takeScreenshot,
  closeBrowser,
  DEFAULT_VIEWPORTS,
} from "./browser.js";
import { inspectDOM, formatIssuesReport } from "./dom-inspector.js";
import { buildAnalysisPrompt } from "./llm-feedback.js";
import { applyFixes, formatFixReport } from "./auto-fixer.js";
import type { AutoFixConfig } from "./auto-fixer.js";
import type { LLMAnalysis } from "./llm-feedback.js";

const VDVOptionsSchema = z.object({
  defaultViewport: z.string().optional(),
  screenshotDir: z.string().optional(),
  maxRetries: z.number().optional(),
  autoFix: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

type VDVOptions = z.infer<typeof VDVOptionsSchema>;

const ValidateArgsSchema = z.object({
  url: z.string().describe("The URL to validate (e.g., http://localhost:3000)"),
  viewport: z
    .enum(["desktop", "laptop", "tablet", "mobile"])
    .optional()
    .describe("Viewport preset (default: desktop)"),
  autoFix: z.boolean().optional().describe("Auto-apply recommended fixes"),
  dryRun: z.boolean().optional().describe("Preview fixes without applying"),
});

const FixArgsSchema = z.object({
  analysisJson: z
    .string()
    .describe("JSON string of the LLMAnalysis object with fixes to apply"),
  dryRun: z.boolean().optional().describe("Preview fixes without applying"),
});

const ScreenshotArgsSchema = z.object({
  url: z.string().describe("The URL to capture"),
  viewports: z
    .array(z.enum(["desktop", "laptop", "tablet", "mobile"]))
    .optional()
    .describe("Viewport presets to capture"),
});

const InspectArgsSchema = z.object({
  url: z.string().describe("The URL to inspect"),
});

const plugin: Plugin = async ({ client, project, directory, $ }) => {
  const options: VDVOptions = {
    defaultViewport: "desktop",
    screenshotDir: path.join(directory, "screenshots"),
    maxRetries: 3,
    autoFix: true,
    dryRun: false,
  };

  return {
    config: async (cfg) => {
      const pluginConfig = (cfg as any).pluginConfig?.["visual-design-validator"];
      if (pluginConfig) {
        Object.assign(options, pluginConfig);
      }
    },

    tool: {
      "visual-validate": {
        description:
          "Validates the visual design of a web page by launching a browser, taking screenshots, inspecting the DOM for layout issues, and generating fix recommendations.",
        args: {
          url: z.string().describe("The URL to validate (e.g., http://localhost:3000)"),
          viewport: z
            .enum(["desktop", "laptop", "tablet", "mobile"])
            .optional()
            .describe("Viewport preset (default: desktop)"),
          autoFix: z.boolean().optional().describe("Auto-apply recommended fixes"),
          dryRun: z.boolean().optional().describe("Preview fixes without applying"),
        },
        execute: async (args: Record<string, unknown>) => {
          const parsed = ValidateArgsSchema.parse(args);
          const vp = parsed.viewport || options.defaultViewport || "desktop";
          const vpConfig = DEFAULT_VIEWPORTS[vp] || DEFAULT_VIEWPORTS.desktop;
          const timestamp = Date.now();
          const screenshotDir =
            options.screenshotDir || path.join(directory, "screenshots");

          try {
            await launchBrowser(vpConfig);
            await navigateTo(parsed.url);

            const screenshotPath = path.join(
              screenshotDir,
              `vdv-${timestamp}.png`
            );
            await takeScreenshot(screenshotPath);

            const page = await import("./browser.js").then((m) =>
              m.getActivePage()
            );
            if (!page) throw new Error("Failed to get active page");

            const inspectionResult = await inspectDOM(page);
            const report = formatIssuesReport(inspectionResult);

            await closeBrowser();

            const analysisPrompt = buildAnalysisPrompt({ inspectionResult });

            return `# Visual Design Validation Results\n\n${report}\n\n---\n\n## LLM Analysis Prompt\nThe following prompt has been generated for AI analysis:\n\n${analysisPrompt}`;
          } catch (error) {
            await closeBrowser();
            return `# Visual Design Validation Error\n\n${error}`;
          }
        },
      },

      "visual-fix": {
        description:
          "Applies AI-recommended visual fixes to CSS/HTML files based on previous validation analysis.",
        args: {
          analysisJson: z
            .string()
            .describe(
              "JSON string of the LLMAnalysis object containing fixes to apply"
            ),
          dryRun: z
            .boolean()
            .optional()
            .describe("Preview fixes without applying them"),
        },
        execute: async (args: Record<string, unknown>) => {
          const parsed = FixArgsSchema.parse(args);
          try {
            const analysis: LLMAnalysis = JSON.parse(parsed.analysisJson);

            if (!analysis.issues || analysis.issues.length === 0) {
              return "No fixes to apply. The analysis contains no issues.";
            }

            const config: AutoFixConfig = {
              projectRoot: directory,
              dryRun: parsed.dryRun ?? options.dryRun ?? false,
              backupOriginal: true,
              maxRetries: options.maxRetries || 3,
            };

            const result = await applyFixes(analysis, config);
            return formatFixReport(result);
          } catch (error) {
            return `# Auto-Fix Error\n\n${error}`;
          }
        },
      },

      "visual-screenshot": {
        description:
          "Takes a screenshot of a URL at one or more viewport sizes for visual comparison.",
        args: {
          url: z.string().describe("The URL to capture"),
          viewports: z
            .array(z.enum(["desktop", "laptop", "tablet", "mobile"]))
            .optional()
            .describe("Viewport presets to capture"),
        },
        execute: async (args: Record<string, unknown>) => {
          const parsed = ScreenshotArgsSchema.parse(args);
          const viewports = parsed.viewports || ["desktop", "mobile"];
          const timestamp = Date.now();
          const results: string[] = [];

          for (const vpName of viewports) {
            const vp = DEFAULT_VIEWPORTS[vpName];
            if (!vp) {
              results.push(`Unknown viewport: ${vpName}`);
              continue;
            }

            try {
              await launchBrowser(vp);
              await navigateTo(parsed.url);
              const screenshotDir =
                options.screenshotDir || path.join(directory, "screenshots");
              const screenshotPath = path.join(
                screenshotDir,
                `vdv-${vpName}-${timestamp}.png`
              );
              const result = await takeScreenshot(screenshotPath);
              results.push(
                `[${vpName}] ${result.viewport.width}x${result.viewport.height} -> ${result.filePath}`
              );
              await closeBrowser();
            } catch (error) {
              results.push(`[${vpName}] Error: ${error}`);
              await closeBrowser();
            }
          }

          return `# Screenshots Captured\n\n${results.join("\n")}`;
        },
      },

      "dom-inspect": {
        description:
          "Inspects the DOM of a running page for layout issues, overlaps, and accessibility problems.",
        args: {
          url: z.string().describe("The URL to inspect"),
        },
        execute: async (args: Record<string, unknown>) => {
          const parsed = InspectArgsSchema.parse(args);
          try {
            await launchBrowser(DEFAULT_VIEWPORTS.desktop);
            await navigateTo(parsed.url);

            const page = await import("./browser.js").then((m) =>
              m.getActivePage()
            );
            if (!page) throw new Error("Failed to get active page");

            const result = await inspectDOM(page);
            await closeBrowser();

            return formatIssuesReport(result);
          } catch (error) {
            await closeBrowser();
            return `# DOM Inspection Error\n\n${error}`;
          }
        },
      },
    },
  };
};

export default plugin;
