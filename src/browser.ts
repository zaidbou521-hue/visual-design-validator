import type { Page, Browser, BrowserContext, ElementHandle } from "playwright";

export interface ViewportConfig {
  width: number;
  height: number;
}

export interface ScreenshotResult {
  filePath: string;
  timestamp: number;
  viewport: ViewportConfig;
}

export interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

const DEFAULT_VIEWPORTS: Record<string, ViewportConfig> = {
  desktop: { width: 1920, height: 1080 },
  laptop: { width: 1366, height: 768 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

let activeInstance: BrowserInstance | null = null;

export async function launchBrowser(
  viewport: ViewportConfig = DEFAULT_VIEWPORTS.desktop
): Promise<BrowserInstance> {
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  activeInstance = { browser, context, page };
  return activeInstance;
}

export async function getActivePage(): Promise<Page | null> {
  return activeInstance?.page ?? null;
}

export async function navigateTo(
  url: string,
  waitFor: "load" | "networkidle" | "domcontentloaded" = "networkidle"
): Promise<void> {
  if (!activeInstance) {
    throw new Error("No active browser instance. Call launchBrowser() first.");
  }
  const isFile = url.startsWith("file://");
  const wait = isFile ? "domcontentloaded" : waitFor;
  await activeInstance.page.goto(url, { waitUntil: wait, timeout: 30000 });
}

export async function takeScreenshot(
  outputPath: string,
  fullPage = true
): Promise<ScreenshotResult> {
  if (!activeInstance) {
    throw new Error("No active browser instance. Call launchBrowser() first.");
  }

  const viewport = activeInstance.page.viewportSize() ?? {
    width: 1920,
    height: 1080,
  };

  await activeInstance.page.screenshot({
    path: outputPath,
    fullPage,
    type: "png",
  });

  return {
    filePath: outputPath,
    timestamp: Date.now(),
    viewport: { width: viewport.width, height: viewport.height },
  };
}

export async function captureAtMultipleViewports(
  baseUrl: string,
  outputDir: string,
  viewports: string[] = ["desktop", "mobile"]
): Promise<Map<string, ScreenshotResult>> {
  const results = new Map<string, ScreenshotResult>();

  for (const vpName of viewports) {
    const vp = DEFAULT_VIEWPORTS[vpName];
    if (!vp) continue;

    const instance = await launchBrowser(vp);
    await navigateTo(baseUrl);

    const path = `${outputDir}/${vpName}-${Date.now()}.png`;
    const result = await takeScreenshot(path);
    results.set(vpName, result);

    await closeBrowser();
  }

  return results;
}

export async function getPageMetrics(): Promise<{
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  devicePixelRatio: number;
}> {
  if (!activeInstance) {
    throw new Error("No active browser instance.");
  }

  return activeInstance.page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientHeight: document.documentElement.clientHeight,
    clientWidth: document.documentElement.clientWidth,
    devicePixelRatio: window.devicePixelRatio,
  }));
}

export async function closeBrowser(): Promise<void> {
  if (activeInstance) {
    await activeInstance.browser.close();
    activeInstance = null;
  }
}

export { DEFAULT_VIEWPORTS };
