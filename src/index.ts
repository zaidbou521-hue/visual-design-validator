export {
  launchBrowser,
  navigateTo,
  takeScreenshot,
  captureAtMultipleViewports,
  getPageMetrics,
  closeBrowser,
  getActivePage,
  DEFAULT_VIEWPORTS,
} from "./browser.js";

export type {
  ViewportConfig,
  ScreenshotResult,
  BrowserInstance,
} from "./browser.js";

export { inspectDOM, formatIssuesReport } from "./dom-inspector.js";

export type {
  DOMIssue,
  ElementInfo,
  InspectionResult,
  BoundingBox,
} from "./dom-inspector.js";

export { buildAnalysisPrompt, parseLLMResponse, buildRetryPrompt } from "./llm-feedback.js";

export type {
  LLMAnalysis,
  FeedbackInput,
} from "./llm-feedback.js";

export { applyFixes, revertFixes, formatFixReport } from "./auto-fixer.js";

export type {
  FixResult,
  AutoFixConfig,
} from "./auto-fixer.js";
