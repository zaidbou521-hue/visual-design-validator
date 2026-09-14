import * as fs from "fs/promises";
import * as path from "path";
import type { LLMAnalysis } from "./llm-feedback";

export interface FixResult {
  success: boolean;
  appliedFixes: Array<{
    file: string;
    action: "edited" | "created" | "skipped";
    description: string;
  }>;
  errors: string[];
}

export interface AutoFixConfig {
  projectRoot: string;
  dryRun?: boolean;
  backupOriginal?: boolean;
  maxRetries?: number;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createBackup(
  filePath: string,
  projectRoot: string
): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const backupPath = `${filePath}.vdbak.${Date.now()}`;
    await fs.writeFile(backupPath, content, "utf-8");
    return backupPath;
  } catch {
    return null;
  }
}

async function applyFileEdit(
  edit: { filePath: string; oldContent: string; newContent: string },
  config: AutoFixConfig
): Promise<{ success: boolean; error?: string }> {
  const fullPath = path.resolve(config.projectRoot, edit.filePath);

  if (!(await fileExists(fullPath))) {
    return { success: false, error: `File not found: ${edit.filePath}` };
  }

  const content = await fs.readFile(fullPath, "utf-8");

  if (!content.includes(edit.oldContent)) {
    return {
      success: false,
      error: `Old content not found in ${edit.filePath}. The file may have been modified.`,
    };
  }

  if (config.dryRun) {
    return { success: true };
  }

  if (config.backupOriginal) {
    await createBackup(fullPath, config.projectRoot);
  }

  const updatedContent = content.replace(edit.oldContent, edit.newContent);
  await fs.writeFile(fullPath, updatedContent, "utf-8");

  return { success: true };
}

async function applyCSSInjection(
  cssChanges: string,
  projectRoot: string,
  dryRun: boolean
): Promise<{ success: boolean; error?: string }> {
  const possibleFiles = [
    "styles.css",
    "src/styles.css",
    "src/index.css",
    "css/style.css",
    "assets/css/style.css",
    "app/styles.css",
    "public/styles.css",
  ];

  for (const relPath of possibleFiles) {
    const fullPath = path.resolve(projectRoot, relPath);
    if (await fileExists(fullPath)) {
      if (dryRun) return { success: true };

      const existing = await fs.readFile(fullPath, "utf-8");
      const marker = "/* === Visual Design Validator Fixes === */";
      const fixBlock = `${marker}\n${cssChanges}\n/* === End VDV Fixes === */\n\n`;

      if (existing.includes(marker)) {
        const updated = existing.replace(
          new RegExp(`${marker}[\\s\\S]*?=== End VDV Fixes === \\*?\\/`),
          fixBlock.trim()
        );
        await fs.writeFile(fullPath, updated, "utf-8");
      } else {
        await fs.writeFile(fullPath, fixBlock + existing, "utf-8");
      }

      return { success: true };
    }
  }

  const injectPath = path.resolve(projectRoot, "src/styles.vdv.css");
  if (!dryRun) {
    await fs.writeFile(injectPath, cssChanges, "utf-8");
  }

  return { success: true };
}

export async function applyFixes(
  analysis: LLMAnalysis,
  config: AutoFixConfig
): Promise<FixResult> {
  const result: FixResult = {
    success: true,
    appliedFixes: [],
    errors: [],
  };

  for (const issue of analysis.issues) {
    for (const edit of issue.fix.fileEdits) {
      const editResult = await applyFileEdit(edit, config);

      if (editResult.success) {
        result.appliedFixes.push({
          file: edit.filePath,
          action: config.dryRun ? "skipped" : "edited",
          description: issue.fix.description,
        });
      } else {
        result.errors.push(editResult.error || "Unknown error");
        result.success = false;
      }
    }

    if (issue.fix.cssChanges && issue.fix.fileEdits.length === 0) {
      const cssResult = await applyCSSInjection(
        issue.fix.cssChanges,
        config.projectRoot,
        config.dryRun ?? false
      );

      if (cssResult.success) {
        result.appliedFixes.push({
          file: "CSS injection",
          action: config.dryRun ? "skipped" : "created",
          description: issue.fix.description,
        });
      } else {
        result.errors.push(cssResult.error || "CSS injection failed");
      }
    }
  }

  return result;
}

export async function revertFixes(projectRoot: string): Promise<number> {
  let reverted = 0;

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        await walk(fullPath);
      } else if (entry.name.includes(".vdbak.")) {
        const originalPath = entry.name.replace(/\.vdbak\.\d+$/, "");
        const originalDir = path.dirname(fullPath);
        const originalFull = path.join(originalDir, originalPath);

        const backupContent = await fs.readFile(fullPath, "utf-8");
        await fs.writeFile(originalFull, backupContent, "utf-8");
        await fs.unlink(fullPath);
        reverted++;
      }
    }
  }

  await walk(projectRoot);
  return reverted;
}

export function formatFixReport(result: FixResult): string {
  const lines: string[] = [
    "# Auto-Fix Report",
    "",
    `**Status:** ${result.success ? "All fixes applied successfully" : "Some fixes failed"}`,
    "",
  ];

  if (result.appliedFixes.length > 0) {
    lines.push(`## Applied Fixes (${result.appliedFixes.length})`);
    for (const fix of result.appliedFixes) {
      lines.push(`- **[${fix.action}]** \`${fix.file}\`: ${fix.description}`);
    }
    lines.push("");
  }

  if (result.errors.length > 0) {
    lines.push(`## Errors (${result.errors.length})`);
    for (const err of result.errors) {
      lines.push(`- ${err}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
