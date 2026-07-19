import { test, expect, type Page } from "@playwright/test";

// Regression coverage for the review-report fixes.

const IDENTITY = (t: string) => t === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t);

// Drive a real touch swipe (native scrolling actually happens, unlike synthetic mouse).
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, n = 8) {
    const c = await page.context().newCDPSession(page);
    await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= n; i++) {
        await c.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n }]
        });
        await page.waitForTimeout(16);
    }
    await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("regressions", () => {
    test("#8 — body gets overscroll-behavior:none while a modal drawer is open, restored on close", async ({
        page
    }) => {
        await page.goto("/test-suite");
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
        await page.goto("/test-suite");
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

    test("#3 — a top drawer swipe-closes only at its content's bottom scroll edge", async ({ page }) => {
        await page.goto("/fixtures");
        const scroller = page.getByTestId("top-scroller");

        // (a) Not at the bottom edge → an upward swipe scrolls the content, drawer stays open.
        await page.getByRole("button", { name: "Open top-scroll" }).click();
        let dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(650);
        await scroller.evaluate((el) => (el.scrollTop = 0));
        let box = (await dialog.boundingBox())!;
        const cx = box.x + box.width / 2;
        await swipe(page, { x: cx, y: box.y + box.height - 20 }, { x: cx, y: box.y + 20 });
        await expect(dialog).toBeVisible(); // did not close — it scrolled

        // (b) Scrolled to the bottom edge → the same upward swipe closes it.
        await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
        box = (await dialog.boundingBox())!;
        await swipe(page, { x: cx, y: box.y + box.height - 20 }, { x: cx, y: box.y - 60 });
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("horizontal-scroll gate — a left drawer scrolls its strip until the close edge", async ({ page }) => {
        await page.goto("/fixtures");
        const scroller = page.getByTestId("left-scroller");
        await page.getByRole("button", { name: "Open left-scroll" }).click();
        const dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(650);

        const sbox = (await scroller.boundingBox())!;
        const dbox = (await dialog.boundingBox())!;

        // (a) Over the scroller (not at the right edge) → a big leftward swipe is yielded to the
        // horizontal scroller, so the drawer does NOT close. Before the fix, horizontal drawers
        // returned "drag" unconditionally and this same swipe would have dismissed it.
        await scroller.evaluate((el) => (el.scrollLeft = 0));
        const scy = sbox.y + sbox.height / 2;
        await swipe(page, { x: sbox.x + sbox.width - 15, y: scy }, { x: sbox.x + 10, y: scy });
        await expect(dialog).toBeVisible();

        // (b) Over the drawer's empty lower area (no scroller in the path) → the leftward swipe
        // drag-closes as normal, proving the gate didn't over-block.
        const ecy = dbox.y + dbox.height - 60;
        await swipe(page, { x: dbox.x + dbox.width - 20, y: ecy }, { x: dbox.x - 140, y: ecy });
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("#4 — snap points that arrive after open reposition the drawer on-screen", async ({ page }) => {
        await page.goto("/fixtures");
        await page.getByRole("button", { name: "Open dynamic-snap" }).click();
        const dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(650);

        // Introduce snap points after the drawer is already open.
        await page.getByTestId("add-snaps").click();
        await page.waitForTimeout(650);

        // The active point must reconcile to the first snap point and rest at a partial,
        // on-screen offset — not stay null and leave the drawer translated fully off-screen.
        const { ty, h } = await dialog.evaluate((el) => {
            const m = new DOMMatrix(getComputedStyle(el).transform);
            return { ty: m.m42, h: el.getBoundingClientRect().height };
        });
        expect(ty).toBeGreaterThan(0); // pushed down to the 0.5 snap point…
        expect(ty).toBeLessThan(h); // …but not the full height off-screen
    });

    test("#6 — Tab stays trapped inside the topmost of two stacked drawers", async ({ page }) => {
        await page.goto("/test-suite");
        await page.getByRole("button", { name: "Open scaling drawer" }).click();
        await expect(page.getByRole("dialog").first()).toBeVisible();
        await page.getByRole("button", { name: "Open nested drawer" }).click();
        const nested = page.getByRole("dialog").filter({ hasText: "Opening me pushed the parent back" });
        await expect(nested).toBeVisible();
        await page.waitForTimeout(300);

        // Tabbing must move focus among the nested drawer's own focusables, never escaping to
        // the (now-inert) parent — and must not freeze (the parent trap must stand down).
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press("Tab");
            const insideNested = await nested.evaluate((el) => el.contains(document.activeElement));
            expect(insideNested).toBe(true);
        }
    });

    test("#10 — Escape during IME composition does not dismiss the drawer", async ({ page }) => {
        await page.goto("/test-suite");
        await page.getByRole("button", { name: "Open uncontrolled" }).click();
        const dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();

        // An Escape that ends an IME composition must be ignored by the dismiss handler.
        await page.evaluate(() => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true }));
        });
        await expect(dialog).toBeVisible();

        // A normal Escape still closes.
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("#19 — drawer text stays selectable (user-select not forced to none when idle)", async ({ page }) => {
        await page.goto("/test-suite");
        await page.getByRole("button", { name: "Open uncontrolled" }).click();
        const dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();
        const us = await dialog.evaluate((el) => getComputedStyle(el).userSelect);
        expect(us).not.toBe("none");
    });

    test("#2 — flick-dismissing a snap drawer reports open:false to onRelease", async ({ page }) => {
        await page.goto("/test-suite");
        await page.getByRole("button", { name: "Open snap drawer" }).click();
        const dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(750);

        const box = (await dialog.boundingBox())!;
        const x = box.x + box.width / 2;
        const startY = box.y + 12;
        await page.mouse.move(x, startY);
        await page.mouse.down();
        for (let i = 1; i <= 6; i++) {
            await page.mouse.move(x, startY + i * 45);
            await page.waitForTimeout(8);
        }
        await page.mouse.up();

        await expect(page.getByRole("dialog")).toHaveCount(0);
        // The release that dismissed it must report open:false, not an unconditional true.
        expect(await page.evaluate(() => (window as unknown as { __lastRelease?: boolean }).__lastRelease)).toBe(false);
    });
});
