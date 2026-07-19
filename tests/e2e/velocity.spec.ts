import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Velocity-throw close + interruptible reopen + no drag-lock timers.
 *
 * These tests assert the *motion*, not just the end state — sampling intermediate transforms so a
 * drawer that JUMPS to closed (the bug this feature originally shipped with) fails, and driving raw
 * pointer input so Playwright's auto-retry can't paper over a covered/blocked target.
 */

/** Parse the translate-Y (px) out of a computed `matrix(...)`; 0 for `none`, NaN if unmounted. */
function translateY(transform: string): number {
	const m = transform.match(/matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)/);
	if (m) return parseFloat(m[1]);
	return transform === "none" ? 0 : NaN;
}

async function openDrawer(page: Page, settleMs = 560): Promise<Locator> {
	await page.goto("/test-suite");
	await page.getByRole("button", { name: "Open", exact: true }).click();
	const dialog = page.getByRole("dialog").first();
	await expect(dialog).toBeVisible();
	if (settleMs) await page.waitForTimeout(settleMs);
	return dialog;
}

/** Drag the drawer down and release. `stepDelayMs` controls flick speed (0 = fast flick). */
async function flickDown(page: Page, dialog: Locator, stepDelayMs: number, step = 45) {
	const box = (await dialog.boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + 16;
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let i = 1; i <= 6; i++) {
		await page.mouse.move(x, y + i * step);
		if (stepDelayMs) await page.waitForTimeout(stepDelayMs);
	}
	await page.mouse.up();
}

/** Sample the live translate-Y `count` times, `everyMs` apart. Unmounted reads become NaN. */
async function sampleY(page: Page, dialog: Locator, count: number, everyMs: number): Promise<number[]> {
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		await page.waitForTimeout(everyMs);
		const t = await dialog.evaluate((el) => getComputedStyle(el).transform).catch(() => "UNMOUNTED");
		out.push(translateY(t));
	}
	return out;
}

test.describe("velocity throw", () => {
	test("the throw ANIMATES through intermediate positions (does not jump to closed)", async ({ page }) => {
		const dialog = await openDrawer(page);
		const height = (await dialog.boundingBox())!.height;
		// A medium flick → a few-hundred-ms throw, so intermediate frames are observable.
		await flickDown(page, dialog, 55, 30);
		const ys = (await sampleY(page, dialog, 4, 35)).filter((n) => !Number.isNaN(n));
		// At least one sample must be strictly between fully-open (0) and fully-closed (height):
		// a jump-to-closed would read `height` (or unmounted) on every sample.
		const intermediate = ys.filter((y) => y > 10 && y < height - 10);
		expect(intermediate.length, `expected an intermediate frame, saw ${JSON.stringify(ys)} (h=${Math.round(height)})`).toBeGreaterThan(0);
		// And it must be moving toward closed (monotonic-ish increase).
		expect(ys[ys.length - 1]).toBeGreaterThan(ys[0]);
	});

	test("a fast flick closes markedly faster than a slow drag", async ({ page }) => {
		async function timeClose(stepDelayMs: number): Promise<number> {
			const dialog = await openDrawer(page);
			await flickDown(page, dialog, stepDelayMs);
			const t0 = Date.now();
			await expect(page.getByRole("dialog")).toHaveCount(0);
			return Date.now() - t0;
		}
		const fast = await timeClose(0);
		const slow = await timeClose(80);
		expect(fast, `fast=${fast} slow=${slow}`).toBeLessThan(slow - 80);
	});
});

test.describe("enter animation", () => {
	test("the enter animates in (transition, not a jump to open)", async ({ page }) => {
		await page.goto("/test-suite");
		await page.getByRole("button", { name: "Open", exact: true }).click();
		const dialog = page.getByRole("dialog").first();
		await expect(dialog).toBeVisible();
		const ys: number[] = [];
		for (let i = 0; i < 4; i++) {
			ys.push(translateY(await dialog.evaluate((el) => getComputedStyle(el).transform).catch(() => "none")));
			await page.waitForTimeout(25);
		}
		// Enter starts near fully-closed (large translate) and moves toward open (0): it must be
		// partway and trending down. A jump-to-open would read ~0 on every sample.
		expect(Math.max(...ys), `enter samples ${JSON.stringify(ys)}`).toBeGreaterThan(30);
		expect(ys[ys.length - 1]).toBeLessThan(ys[0]);
	});
});

test.describe("no drag-lock timers", () => {
	// The old 500ms post-open lock swallowed drags. Flicking well within that window must now close —
	// a re-introduced lock would leave the dialog mounted.
	for (const openDelay of [80, 300]) {
		test(`flick ${openDelay}ms after open still dismisses`, async ({ page }) => {
			await page.goto("/test-suite");
			await page.getByRole("button", { name: "Open", exact: true }).click();
			const dialog = page.getByRole("dialog").first();
			await expect(dialog).toBeVisible();
			await page.waitForTimeout(openDelay);
			await flickDown(page, dialog, 0);
			await expect(page.getByRole("dialog")).toHaveCount(0);
		});
	}
});

test.describe("interruptible close", () => {
	test("the backdrop lets a tap through to the trigger while closing", async ({ page }) => {
		const openBtn = page.getByRole("button", { name: "Open", exact: true });
		const dialog = await openDrawer(page);
		const btnBox = (await openBtn.boundingBox())!;
		await flickDown(page, dialog, 55); // slow enough that the overlay is still mounted
		await page.waitForTimeout(25);
		// The element at the trigger's centre must be the trigger, NOT the fading overlay.
		const tag = await page.evaluate(
			([x, y]) => document.elementFromPoint(x, y)?.tagName ?? "none",
			[btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2]
		);
		expect(tag).toBe("BUTTON");
	});

	test("re-opening mid-close glides back without ever reaching fully-closed", async ({ page }) => {
		const dialog = await openDrawer(page);
		const height = (await dialog.boundingBox())!.height;
		await flickDown(page, dialog, 55); // slow-ish close → a real interrupt window
		await page.waitForTimeout(40);
		// A single, un-retried click — the backdrop must not intercept it.
		await page.getByRole("button", { name: "Open", exact: true }).click({ noWaitAfter: true });
		const ys = (await sampleY(page, dialog, 5, 30)).filter((n) => !Number.isNaN(n));
		// Never fully closed (a fresh keyframe reopen would first snap to `height`); trends back to open.
		expect(Math.max(...ys), `saw ${JSON.stringify(ys)} (h=${Math.round(height)})`).toBeLessThan(height - 5);
		expect(ys[ys.length - 1]).toBeLessThan(ys[0]);
		await expect(dialog).toBeVisible();
	});

	test("re-opening mid NON-swipe (outside-click) close also glides continuously", async ({ page }) => {
		const dialog = await openDrawer(page);
		const height = (await dialog.boundingBox())!.height;
		await page.mouse.click(8, 8); // outside-click close (no velocity) — now transition-driven too
		await page.waitForTimeout(60);
		await page.getByRole("button", { name: "Open", exact: true }).click({ noWaitAfter: true });
		const ys = (await sampleY(page, dialog, 5, 30)).filter((n) => !Number.isNaN(n));
		// Continuous reverse from the live position — never jumps to fully-closed first.
		expect(Math.max(...ys), `saw ${JSON.stringify(ys)} (h=${Math.round(height)})`).toBeLessThan(height - 5);
		await expect(dialog).toBeVisible();
	});
});

test.describe("non-swipe closes animate (default duration, no velocity)", () => {
	test("an outside click animates closed", async ({ page }) => {
		const dialog = await openDrawer(page);
		const height = (await dialog.boundingBox())!.height;
		await page.mouse.click(8, 8); // overlay, top-left
		await page.waitForTimeout(120);
		const t = await dialog.evaluate((el) => getComputedStyle(el).transform).catch(() => "UNMOUNTED");
		const y = translateY(t);
		// Mid-animation it must be partway, not already at `height` (the jump bug) nor unmounted.
		expect(y, `transform=${t}`).toBeGreaterThan(10);
		expect(y).toBeLessThan(height - 10);
	});
});
