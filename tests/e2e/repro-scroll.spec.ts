import { test, expect, type Page } from "@playwright/test";

// Regression guard for the "scrollable full-screen drawer" report: even scrolled all
// the way to the top, a downward swipe must still close the drawer. Uses REAL touch
// input (CDP Input.dispatchTouchEvent) so native scrolling of the inner container
// actually happens — the browser fires `pointercancel` mid-gesture, and the drawer must
// survive it (via the touch-event fallback) instead of aborting the drag.

async function touchDrag(page: Page, steps: Array<{ y: number; x?: number }>, { pauseMs = 16 } = {}) {
    const client = await page.context().newCDPSession(page);
    const x0 = steps[0].x ?? 180;
    await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: x0, y: steps[0].y }]
    });
    for (let i = 1; i < steps.length; i++) {
        await client.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: steps[i].x ?? 180, y: steps[i].y }]
        });
        await page.waitForTimeout(pauseMs);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function openFullScreen(page: Page) {
    await page.goto("/");
    await page.getByRole("button", { name: "Open Full-screen" }).click();
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(650); // clear the 500ms open-animation drag block
    const scroller = dialog.locator(".overflow-y-auto");
    return { dialog, scroller };
}

test.describe("scrollable full-screen drawer", () => {
    test("FRESH swipe down at scrollTop 0 closes", async ({ page }) => {
        const { scroller } = await openFullScreen(page);
        await scroller.evaluate((el) => (el.scrollTop = 0));

        const steps = [];
        for (let y = 120; y <= 520; y += 40) steps.push({ y });
        await touchDrag(page, steps);

        await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("CONTINUOUS gesture: scroll up to top then keep dragging down closes", async ({ page }) => {
        const { scroller } = await openFullScreen(page);
        await scroller.evaluate((el) => (el.scrollTop = 200));
        expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

        const steps = [];
        for (let y = 100; y <= 620; y += 30) steps.push({ y });
        await touchDrag(page, steps);

        await expect(page.getByRole("dialog")).toHaveCount(0);
    });
});
