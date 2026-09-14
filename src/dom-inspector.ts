import type { Page } from "playwright";

export interface DOMIssue {
  type:
    | "overlap"
    | "overflow"
    | "missing-alt"
    | "tiny-target"
    | "text-contrast"
    | "uneven-spacing"
    | "broken-layout"
    | "missing-label"
    | "z-index-layering";
  severity: "critical" | "warning" | "info";
  selector: string;
  description: string;
  boundingBox: BoundingBox | null;
  suggestedFix: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  outOfViewport?: boolean;
}

export interface ElementInfo {
  tag: string;
  selector: string;
  boundingBox: BoundingBox | null;
  styles: Record<string, string>;
  isVisible: boolean;
  text?: string;
  role?: string;
  ariaLabel?: string;
}

export interface InspectionResult {
  issues: DOMIssue[];
  elements: ElementInfo[];
  pageMetrics: {
    totalElements: number;
    visibleElements: number;
    interactiveElements: number;
  };
}

const SELECTORS = {
  interactive: 'button, a, input, select, textarea, [role="button"], [role="link"], [onclick]',
  images: "img",
  headings: "h1, h2, h3, h4, h5, h6",
  containers: "div, section, article, main, nav, aside, header, footer",
  formElements: "input, select, textarea",
};

async function getElementInfos(
  page: Page,
  selector: string
): Promise<ElementInfo[]> {
  return page.evaluate((sel: string) => {
    const elements = Array.from(document.querySelectorAll(sel));
    return elements.slice(0, 200).map((el) => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      const isOutOfViewport =
        rect.right < -10 ||
        rect.bottom < -10 ||
        rect.left > viewportW + 10 ||
        rect.top > viewportH + 10;

      return {
        tag: el.tagName.toLowerCase(),
        selector: el.id
          ? `#${el.id}`
          : el.className && typeof el.className === "string"
            ? `${el.tagName.toLowerCase()}.${el.className.trim().split(/\s+/).join(".")}`
            : el.tagName.toLowerCase(),
        boundingBox: rect.width > 0 || rect.height > 0
          ? {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              outOfViewport: isOutOfViewport,
            }
          : null,
        styles: {
          position: styles.position,
          display: styles.display,
          margin: styles.margin,
          padding: styles.padding,
          gap: styles.gap,
          overflow: styles.overflow,
          zIndex: styles.zIndex,
          opacity: styles.opacity,
          fontSize: styles.fontSize,
          color: styles.color,
          backgroundColor: styles.backgroundColor,
        },
        isVisible:
          styles.display !== "none" &&
          styles.visibility !== "hidden" &&
          parseFloat(styles.opacity) > 0 &&
          !isOutOfViewport,
        text: el.textContent?.trim().slice(0, 100) || undefined,
        role: el.getAttribute("role") || undefined,
        ariaLabel: el.getAttribute("aria-label") || undefined,
      };
    });
  }, selector);
}

function checkOverlaps(elements: ElementInfo[]): DOMIssue[] {
  const issues: DOMIssue[] = [];
  const interactive = elements.filter(
    (e) =>
      e.boundingBox &&
      e.isVisible &&
      (["button", "a", "input", "select", "textarea"].includes(e.tag) ||
        e.role === "button")
  );

  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const a = interactive[i].boundingBox!;
      const b = interactive[j].boundingBox!;

      const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

      if (overlapX > 0 && overlapY > 0) {
        const overlapArea = overlapX * overlapY;
        const minArea = Math.min(a.width * a.height, b.width * b.height);
        if (minArea > 0 && overlapArea / minArea > 0.25) {
          const intersectionX = Math.max(a.x, b.x);
          const intersectionY = Math.max(a.y, b.y);
          issues.push({
            type: "overlap",
            severity: "critical",
            selector: `${interactive[i].selector} ↔ ${interactive[j].selector}`,
            description: `Two interactive elements overlap by ${(overlapArea / minArea * 100).toFixed(1)}%`,
            boundingBox: {
              x: intersectionX,
              y: intersectionY,
              width: overlapX,
              height: overlapY,
            },
            suggestedFix: `Add spacing or reposition ${interactive[i].selector} and ${interactive[j].selector} to prevent click conflicts.`,
          });
        }
      }
    }
  }

  return issues;
}

function checkOverflow(elements: ElementInfo[]): DOMIssue[] {
  const issues: DOMIssue[] = [];

  for (const el of elements) {
    if (!el.boundingBox || !el.isVisible) continue;
    if (el.styles.overflow === "hidden" || el.styles.overflow === "clip") continue;

    const parent = elements.find(
      (p) =>
        p.boundingBox &&
        p.boundingBox.x <= el.boundingBox!.x &&
        p.boundingBox.y <= el.boundingBox!.y &&
        p.boundingBox.x + p.boundingBox.width >=
          el.boundingBox!.x + el.boundingBox!.width
    );

    if (parent?.boundingBox && el.boundingBox) {
      const rightEdge = el.boundingBox.x + el.boundingBox.width;
      const parentRight = parent.boundingBox.x + parent.boundingBox.width;
      if (rightEdge > parentRight + 2) {
        issues.push({
          type: "overflow",
          severity: "warning",
          selector: el.selector,
          description: `Element overflows its parent container by ${(rightEdge - parentRight).toFixed(0)}px on the right`,
          boundingBox: el.boundingBox,
          suggestedFix: `Add overflow: hidden to parent or reduce width/padding of ${el.selector}.`,
        });
      }
    }
  }

  return issues;
}

function checkTinyTargets(elements: ElementInfo[]): DOMIssue[] {
  const issues: DOMIssue[] = [];
  const MIN_TARGET_SIZE = 44;

  for (const el of elements) {
    if (!el.boundingBox || !el.isVisible) continue;
    const isInteractive =
      ["button", "a", "input", "select", "textarea"].includes(el.tag) ||
      el.role === "button";

    if (isInteractive) {
      if (el.boundingBox.width < MIN_TARGET_SIZE || el.boundingBox.height < MIN_TARGET_SIZE) {
        issues.push({
          type: "tiny-target",
          severity: "warning",
          selector: el.selector,
          description: `Interactive element is ${el.boundingBox.width.toFixed(0)}x${el.boundingBox.height.toFixed(0)}px (minimum recommended: ${MIN_TARGET_SIZE}x${MIN_TARGET_SIZE}px)`,
          boundingBox: el.boundingBox,
          suggestedFix: `Increase padding on ${el.selector} to meet the ${MIN_TARGET_SIZE}px minimum touch target size.`,
        });
      }
    }
  }

  return issues;
}

function checkMissingAltText(elements: ElementInfo[]): DOMIssue[] {
  const issues: DOMIssue[] = [];

  for (const el of elements) {
    if (el.tag === "img" && !el.ariaLabel && !el.text) {
      issues.push({
        type: "missing-alt",
        severity: "critical",
        selector: el.selector,
        description: "Image element missing alt text or aria-label",
        boundingBox: el.boundingBox,
        suggestedFix: `Add an descriptive alt attribute to ${el.selector}.`,
      });
    }
  }

  return issues;
}

function checkUnevenSpacing(elements: ElementInfo[]): DOMIssue[] {
  const issues: DOMIssue[] = [];

  const siblings = elements.filter(
    (e) =>
      e.boundingBox &&
      e.isVisible &&
      ["div", "li", "article", "section"].includes(e.tag)
  );

  const yGroups = new Map<number, ElementInfo[]>();
  for (const el of siblings) {
    if (!el.boundingBox) continue;
    const roundedY = Math.round(el.boundingBox.y / 20) * 20;
    const group = yGroups.get(roundedY) || [];
    group.push(el);
    yGroups.set(roundedY, group);
  }

  for (const [, group] of yGroups) {
    if (group.length < 3) continue;
    const spacings: number[] = [];
    const sorted = group.sort(
      (a, b) => (a.boundingBox?.x ?? 0) - (b.boundingBox?.x ?? 0)
    );

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].boundingBox!;
      const curr = sorted[i].boundingBox!;
      spacings.push(curr.x - (prev.x + prev.width));
    }

    if (spacings.length >= 2) {
      const avg = spacings.reduce((s, v) => s + v, 0) / spacings.length;
      const variance =
        spacings.reduce((s, v) => s + Math.pow(v - avg, 2), 0) /
        spacings.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > avg * 0.3 && avg > 5) {
        issues.push({
          type: "uneven-spacing",
          severity: "info",
          selector: sorted.map((s) => s.selector).join(", "),
          description: `Uneven horizontal spacing detected: std dev ${stdDev.toFixed(1)}px vs avg ${avg.toFixed(1)}px`,
          boundingBox: sorted[0].boundingBox,
          suggestedFix: `Use consistent gap or margin values (e.g., display: flex with gap: ${Math.round(avg)}px) for even spacing.`,
        });
      }
    }
  }

  return issues;
}

function checkZIndexLayers(elements: ElementInfo[]): DOMIssue[] {
  const issues: DOMIssue[] = [];
  const positioned = elements.filter(
    (e) =>
      e.isVisible &&
      (e.styles.position === "absolute" || e.styles.position === "fixed")
  );

  const zIndexValues = positioned
    .map((e) => ({
      el: e,
      z: parseInt(e.styles.zIndex) || 0,
    }))
    .filter((v) => !isNaN(v.z));

  for (let i = 0; i < zIndexValues.length; i++) {
    for (let j = i + 1; j < zIndexValues.length; j++) {
      const a = zIndexValues[i];
      const b = zIndexValues[j];

      const aBbox = a.el.boundingBox;
      const bBbox = b.el.boundingBox;

      if (aBbox && bBbox) {
        const overlapX = Math.max(0, Math.min(aBbox.x + aBbox.width, bBbox.x + bBbox.width) - Math.max(aBbox.x, bBbox.x));
        const overlapY = Math.max(0, Math.min(aBbox.y + aBbox.height, bBbox.y + bBbox.height) - Math.max(aBbox.y, bBbox.y));

        if (overlapX > 0 && overlapY > 0 && a.z === b.z) {
          issues.push({
            type: "z-index-layering",
            severity: "warning",
            selector: `${a.el.selector} ↔ ${b.el.selector}`,
            description: `Two overlapping positioned elements share z-index: ${a.z}`,
            boundingBox: aBbox,
            suggestedFix: `Assign distinct z-index values to ${a.el.selector} and ${b.el.selector}.`,
          });
        }
      }
    }
  }

  return issues;
}

function checkMissingFormLabels(elements: ElementInfo[]): DOMIssue[] {
  const issues: DOMIssue[] = [];

  for (const el of elements) {
    if (["input", "select", "textarea"].includes(el.tag)) {
      if (el.tag === "input") continue;
      const hasLabel =
        el.ariaLabel ||
        el.styles.position !== "absolute";

      if (!hasLabel) {
        issues.push({
          type: "missing-label",
          severity: "critical",
          selector: el.selector,
          description: "Form element appears to be missing an associated label",
          boundingBox: el.boundingBox,
          suggestedFix: `Add a <label> element or aria-label attribute to ${el.selector}.`,
        });
      }
    }
  }

  return issues;
}

export async function inspectDOM(page: Page): Promise<InspectionResult> {
  const allSelectors = Object.values(SELECTORS).join(", ");
  const allElements = await getElementInfos(page, allSelectors);

  const issues: DOMIssue[] = [
    ...checkOverlaps(allElements),
    ...checkOverflow(allElements),
    ...checkTinyTargets(allElements),
    ...checkMissingAltText(allElements.filter((e) => e.tag === "img")),
    ...checkUnevenSpacing(allElements),
    ...checkZIndexLayers(allElements),
    ...checkMissingFormLabels(allElements),
  ];

  issues.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const visibleElements = allElements.filter((e) => e.isVisible);
  const interactiveElements = visibleElements.filter(
    (e) =>
      ["button", "a", "input", "select", "textarea"].includes(e.tag) ||
      e.role === "button"
  );

  return {
    issues,
    elements: allElements,
    pageMetrics: {
      totalElements: allElements.length,
      visibleElements: visibleElements.length,
      interactiveElements: interactiveElements.length,
    },
  };
}

export function formatIssuesReport(result: InspectionResult): string {
  const lines: string[] = [
    "# Visual Design Inspection Report",
    "",
    `**Elements scanned:** ${result.pageMetrics.totalElements} total, ${result.pageMetrics.visibleElements} visible, ${result.pageMetrics.interactiveElements} interactive`,
    `**Issues found:** ${result.issues.length}`,
    "",
  ];

  const bySeverity = {
    critical: result.issues.filter((i) => i.severity === "critical"),
    warning: result.issues.filter((i) => i.severity === "warning"),
    info: result.issues.filter((i) => i.severity === "info"),
  };

  for (const [severity, issues] of Object.entries(bySeverity)) {
    if (issues.length === 0) continue;
    lines.push(`## ${severity.toUpperCase()} (${issues.length})`);
    for (const issue of issues) {
      lines.push(`- **[${issue.type}]** \`${issue.selector}\``);
      lines.push(`  ${issue.description}`);
      lines.push(`  Fix: ${issue.suggestedFix}`);
      lines.push("");
    }
  }

  if (result.issues.length === 0) {
    lines.push("**No issues found!** The design appears clean.");
  }

  return lines.join("\n");
}
