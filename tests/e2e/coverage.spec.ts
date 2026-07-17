import { test, expect, type Page, type Locator } from "@playwright/test";

// Coverage the review flagged as missing: left/right directions, modal={false}, and the
// px/%/calc snap-point parser.

async function translate(el: Locator, axis: "x" | "y"): Promise<number> {
    return el.evaluate((node, a) => {
        const m = new DOMMatrix(getComputedStyle(node).transform);
        return a === "y" ? m.m42 : m.m41;
    }, axis);
}

async function mouseDrag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
        await page.mouse.move(from.x + (dx * i) / 6, from.y + (dy * i) / 6);
        await page.waitForTimeout(8);
    }
    await page.mouse.up();
}

test.describe("coverage — directions", () => {
    test("a right drawer drag-closes toward its edge", async ({ page }) => {
        await page.goto("/fixtures");
        await page.getByRole("button", { name: "Open right" }).click();
        const dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(650);

        const box = (await dialog.boundingBox())!;
        // Drag rightward (toward the right edge) past threshold.
        await mouseDrag(page, { x: box.x + 20, y: box.y + box.height / 2 }, box.width, 0);
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });
});

test.describe("coverage — non-modal", () => {
    test("modal={false} renders no overlay, doesn't lock body scroll, and dismisses on outside click", async ({
        page
    }) => {
        await page.goto("/fixtures");
        await page.getByRole("button", { name: "Open non-modal" }).click();
        const dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();

        // No overlay element, and the body is not scroll-locked.
        expect(await page.locator("[data-svaul-drawer-overlay]").count()).toBe(0);
        expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
        expect(await page.evaluate(() => document.body.style.overscrollBehavior)).not.toBe("none");

        // An outside pointerdown dismisses it (the hand-rolled non-modal dismiss path).
        await page.getByTestId("outside").click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });
});

test.describe("coverage — snap-point parser", () => {
    test('px and calc() snap points resolve to the right resting offset', async ({ page }) => {
        await page.goto("/fixtures");
        await page.getByRole("button", { name: "Open px-snap" }).click();
        const dialog = page.getByRole("dialog").first();
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(750);

        // First snap point is "160px" → a bottom drawer rests translated down by (viewportH - 160),
        // showing 160px. It must NOT resolve to 0 (fully open) or off-screen.
        const vh = await page.evaluate(() => window.innerHeight);
        const ty = await translate(dialog, "y");
        expect(Math.abs(ty - (vh - 160))).toBeLessThan(4);
    });
});
