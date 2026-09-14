import { fileURLToPath } from "url";
import * as path from "path";
import {
  launchBrowser,
  navigateTo,
  takeScreenshot,
  closeBrowser,
  getPageMetrics,
} from "./dist/browser.js";
import { inspectDOM, formatIssuesReport } from "./dist/dom-inspector.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testPagePath = path.join(__dirname, "test-page.html");
const testPageUrl = `file:///${testPagePath.replace(/\\/g, "/")}`;

async function main() {
  console.log("=== Live Browser Test ===\n");

  try {
    // 1. Launch browser
    console.log("1. Launching Chromium...");
    await launchBrowser({ width: 1280, height: 800 });
    console.log("   OK: Browser launched\n");

    // 2. Navigate
    console.log("2. Navigating to test page...");
    await navigateTo(testPageUrl);
    console.log("   OK: Navigated\n");

    // 3. Page metrics
    console.log("3. Getting page metrics...");
    const metrics = await getPageMetrics();
    console.log(`   OK: ${JSON.stringify(metrics, null, 2)}\n`);

    // 4. Screenshot
    console.log("4. Taking screenshot...");
    const shot = await takeScreenshot("screenshots/browser-test.png");
    console.log(`   OK: Screenshot saved -> ${shot.filePath}\n`);

    // 5. DOM inspection
    console.log("5. Running DOM inspection...");
    const page = (await import("./dist/browser.js")).getActivePage;
    const activePage = await page();
    if (!activePage) throw new Error("No active page");
    const result = await inspectDOM(activePage);
    console.log(formatIssuesReport(result));
    console.log("");

    await closeBrowser();
    console.log("6. Browser closed.");
    console.log("\n=== Live browser test completed ===");
  } catch (err) {
    console.error("BROWSER TEST FAILED:", err);
    await closeBrowser();
    process.exit(1);
  }
}

main();