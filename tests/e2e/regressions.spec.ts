import { test, expect } from "@playwright/test";

// Regression coverage for the review-report fixes.

const IDENTITY = (t: string) => t === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t);

test.describe("regressions", () => {
    test("#8 — body gets overscroll-behavior:none while a modal drawer is open, restored on close", async ({
        page
    }) => {
        await page.goto("/playground");
        const before = await page.evaluate(() => document.body.style.overscrollBehavior);

        await page.getByRole("button", { name: "Open uncontrolled" }).click();
        await expect(page.getByRole("dialog").first()).toBeVisible();
        expect(await page.evaluate(() => document.body.style.overscrollBehavior)).toBe("none");

        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(await page.evaluate(() => document.body.style.overscrollBehavior)).toBe(before);
    });

    test("#2 — reopening a keepMounted drawer after a drag-close is not stuck mid-drag", async ({ page }) => {
        await page.goto("/keepmounted");
        const openBtn = page.getByRole("button", { name: "Open keepMounted" });

        await openBtn.click();
        let dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(650);

        // Drag it down past the close threshold.
        const box = (await dialog.boundingBox())!;
        const sx = box.x + box.width / 2;
        const sy = box.y + 16;
        await page.mouse.move(sx, sy);
        await page.mouse.down();
        for (let i = 1; i <= 6; i++) {
            await page.mouse.move(sx, sy + i * 40);
            await page.waitForTimeout(10);
        }
        await page.mouse.up();
        await expect(page.getByRole("dialog")).toHaveCount(0);

        // Reopen — with keepMounted the element persists, so a stale mid-drag transform would
        // survive. It must come back at the clean resting position.
        await openBtn.click();
        dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(650);
        const transform = await dialog.evaluate((el) => getComputedStyle(el).transform);
        expect(IDENTITY(transform)).toBe(true);
    });

    test("#7 — touchcancel mid-drag settles the drawer instead of freezing it", async ({ page }) => {
        await page.goto("/playground");
        await page.getByRole("button", { name: "Open uncontrolled" }).click();
        const dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(650);

        const box = (await dialog.boundingBox())!;
        const sx = box.x + box.width / 2;
        const startY = box.y + 16;

        // Start a slow, sub-threshold drag but never lift the finger — so no pointerup/touchend
        // fires. This mirrors a real system interruption (incoming call, shade pull), where the
        // OS delivers only touchcancel. (CDP's touchCancel terminal *also* synthesizes a
        // pointerup, which would mask the bug — so we dispatch the touchcancel ourselves.)
        const client = await page.context().newCDPSession(page);
        await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: startY }] });
        for (const dy of [14, 24]) {
            await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx, y: startY + dy }] });
            await page.waitForTimeout(90); // keep velocity low so a settle resets (not flick-closes)
        }
        // Mid-drag the drag class is on and there's an offset.
        await expect(dialog).toHaveClass(/svaul-drawer-dragging/);

        // A bare system touchcancel with no accompanying pointerup.
        await dialog.dispatchEvent("touchcancel");

        // The drawer must settle: still open, drag class cleared, transform reset — not frozen
        // at a partial offset with `svaul-drawer-dragging` stuck on and isDragging never cleared.
        await expect(dialog).toBeVisible();
        await expect(dialog).not.toHaveClass(/svaul-drawer-dragging/);
        await page.waitForTimeout(550);
        const transform = await dialog.evaluate((el) => getComputedStyle(el).transform);
        expect(IDENTITY(transform)).toBe(true);
    });
});
