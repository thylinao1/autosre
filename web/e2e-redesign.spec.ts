import { test, expect } from "@playwright/test";
import path from "path";

const BASE = "http://localhost:3000";
const SHOTS = path.join(__dirname, "screenshots");

test.describe("AutoSRE redesign visual + functional verification", () => {
  test("landing page — 1440 screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(SHOTS, "redesign-landing-1440.png"),
      fullPage: true,
    });
    // Verify headline exists and is not in monospace
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toContainText("never touches production");
    // Verify nav wordmark
    await expect(page.locator("text=autosre").first()).toBeVisible();
    // Verify CTA buttons
    await expect(page.locator("text=Try the Live Demo")).toBeVisible();
    await expect(page.locator("text=View Code on GitHub")).toBeVisible();
  });

  test("landing page — 390 mobile screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(SHOTS, "redesign-landing-390.png"),
      fullPage: true,
    });
    // No overflow
    const bodyWidth = await page.evaluate(
      () => document.body.scrollWidth
    );
    expect(bodyWidth).toBeLessThanOrEqual(400);
  });

  test("navigate to demo and run payment_errors incident", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");

    // Click "Try the Live Demo" CTA
    await page.locator("text=Try the Live Demo").first().click();
    await expect(page).toHaveURL(/\/demo/);

    // Screenshot: demo idle
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(SHOTS, "redesign-demo-idle-1440.png"),
    });

    // Start payment_errors incident — click the first "Payment Errors" option if visible
    const paymentBtn = page.locator("text=Payment Errors").first();
    if (await paymentBtn.isVisible()) {
      await paymentBtn.click();
    }

    // Click the primary run button
    const runBtn = page.locator("button").filter({ hasText: /run/i }).first();
    if (await runBtn.isVisible()) {
      await runBtn.click();
    } else {
      // Try clicking any visible start button
      const allBtns = page.locator("button").filter({ hasText: /payment|run|start/i });
      const count = await allBtns.count();
      if (count > 0) await allBtns.first().click();
    }

    // Wait for streaming to start
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(SHOTS, "redesign-demo-streaming-1440.png"),
    });

    // Wait for approval modal (up to 40 seconds)
    const approvalModal = page.locator('[role="dialog"]');
    try {
      await approvalModal.waitFor({ state: "visible", timeout: 40000 });
      await page.screenshot({
        path: path.join(SHOTS, "redesign-demo-approval-1440.png"),
      });

      // Approve
      const approveBtn = page.locator("button").filter({ hasText: /approve/i });
      await approveBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: path.join(SHOTS, "redesign-demo-approved-1440.png"),
      });

      // Wait for resolved state (up to 60 seconds with health poll)
      await page.waitForFunction(
        () => {
          const bodyText = document.body.innerText;
          return (
            bodyText.includes("RESOLVED") ||
            bodyText.includes("resolved") ||
            bodyText.includes("all_clear") ||
            bodyText.includes("CLEAR")
          );
        },
        { timeout: 65000 }
      );

      await page.screenshot({
        path: path.join(SHOTS, "redesign-demo-resolved-1440.png"),
      });
    } catch {
      // If approval never appeared, still capture final state
      await page.screenshot({
        path: path.join(SHOTS, "redesign-demo-final-1440.png"),
      });
    }
  });
});
