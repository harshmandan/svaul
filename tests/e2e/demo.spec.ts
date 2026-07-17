import { test, expect, type Page } from "@playwright/test";

const checkbox = (page: Page, label: string) =>
	page.locator("label.toggle", { hasText: label }).getByRole("checkbox");

test.describe("Phase 6 — feature-toggle demo", () => {
	test("opens the configurable drawer", async ({ page }) => {
		await page.goto("/config");
		await page.getByRole("button", { name: "Open drawer" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(1);
	});

	test("nested toggle reveals a nested drawer inside", async ({ page }) => {
		await page.goto("/config");
		await checkbox(page, "Nested drawer").check();
		await page.getByRole("button", { name: "Open drawer" }).click();
		await page.getByRole("button", { name: "Open nested drawer" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(2);
	});

	test("clicking outside a nested drawer dismisses only the nested one", async ({ page }) => {
		await page.goto("/config");
		await checkbox(page, "Nested drawer").check();
		await page.getByRole("button", { name: "Open drawer" }).click();
		await page.getByRole("button", { name: "Open nested drawer" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(2);
		await page.waitForTimeout(300);

		// Click near the top of the viewport — outside the (bottom) nested drawer,
		// on the nested overlay. Only the nested drawer should close.
		await page.mouse.click(page.viewportSize()!.width / 2, 30);

		await expect(page.getByRole("dialog")).toHaveCount(1); // parent still open
	});

	test("scale background fully reverts after dismissing (no stuck scale)", async ({ page }) => {
		await page.goto("/config");
		await checkbox(page, "Scale background").check();
		await page.getByRole("button", { name: "Open drawer" }).click();
		await page.waitForTimeout(200);

		const wrapper = page.locator("[data-svaul-drawer-wrapper]");
		const scaled = await wrapper.evaluate((el) => getComputedStyle(el).transform);
		expect(scaled).not.toBe("none"); // currently scaled

		// dismiss by clicking outside (overlay), then wait past the revert + cleanup timer
		await page.mouse.click(page.viewportSize()!.width / 2, 20);
		await page.waitForTimeout(900);

		const after = await wrapper.evaluate((el) => getComputedStyle(el).transform);
		expect(after === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(after)).toBe(true);
		// body background restored too (not left black)
		const bg = await page.evaluate(() => document.body.style.background);
		expect(bg).not.toContain("black");
	});

	test("amplified drag (dragSensitivity 2) moves the drawer 2× the cursor", async ({ page }) => {
		await page.goto("/");
		const amp = page.getByRole("button", { name: "Open Amplified drag" });
		await amp.scrollIntoViewIfNeeded();
		await amp.click();
		const dialog = page.getByRole("dialog").first();
		await expect(dialog).toBeVisible();
		await page.waitForTimeout(700);

		const d = (await dialog.boundingBox())!;
		const x = d.x + d.width / 2;
		const y = d.y + 16;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x, y + 60);
		await page.waitForTimeout(30);
		const ty = await dialog.evaluate((el) => {
			const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/);
			return m ? Number.parseFloat(m[1].split(", ")[5]) : 0;
		});
		await page.mouse.up();
		expect(ty).toBeGreaterThan(100); // 60px cursor → ~120px drawer, not ~60
	});

	test("a top drawer dismisses by dragging up (on a scrolled page)", async ({ page }) => {
		await page.goto("/");
		// The Top example sits far down the page — opening it from a scrolled
		// position exercises the same scrolled-page drag scenario.
		const card = page.getByRole("button", { name: "Open Top drawer" });
		await card.scrollIntoViewIfNeeded();
		await card.click();
		const dialog = page.getByRole("dialog").first();
		await expect(dialog).toBeVisible();
		await page.waitForTimeout(700);

		const box = (await dialog.boundingBox())!;
		const x = box.x + box.width / 2;
		const startY = box.y + box.height - 16;
		await page.mouse.move(x, startY);
		await page.mouse.down();
		for (let i = 1; i <= 7; i++) {
			await page.mouse.move(x, startY - i * 40);
			await page.waitForTimeout(10);
		}
		await page.mouse.up();
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	test("the handle sits on the inner edge per direction (top → bottom)", async ({ page }) => {
		await page.goto("/");
		const card = page.getByRole("button", { name: "Open Top drawer" });
		await card.scrollIntoViewIfNeeded();
		await card.click();
		const dialog = page.getByRole("dialog").first();
		await expect(dialog).toBeVisible();
		await page.waitForTimeout(300);
		const d = (await dialog.boundingBox())!;
		const h = (await page.locator("[data-svaul-drawer-handle]").boundingBox())!;
		expect(h.y).toBeGreaterThan(d.y + d.height / 2); // handle on the bottom edge
	});

	test("disable transitions removes motion", async ({ page }) => {
		await page.goto("/config");
		await checkbox(page, "Disable transitions").check();
		await page.getByRole("button", { name: "Open drawer" }).click();
		const dialog = page.getByRole("dialog").first();
		await expect(dialog).toHaveAttribute("data-svaul-drawer-no-animate", "");
		const dur = await dialog.evaluate((el) => getComputedStyle(el).transitionDuration);
		expect(dur).toBe("0s");
	});

	test("disable transitions dismisses instantly (no wait for the scale revert)", async ({
		page
	}) => {
		await page.goto("/config");
		await checkbox(page, "Disable transitions").check();
		await checkbox(page, "Scale background").check();
		await page.getByRole("button", { name: "Open drawer" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(1);

		await page.keyboard.press("Escape");
		// With no animation the drawer must unmount immediately, not after the 0.5s
		// transition/scale-revert window.
		await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 120 });
	});

	test("intercept back button closes the drawer instead of navigating", async ({ page }) => {
		await page.goto("/config");
		await checkbox(page, "Intercept back button").check();
		await page.getByRole("button", { name: "Open drawer" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(1);

		await page.goBack();
		await expect(page.getByRole("dialog")).toHaveCount(0);
		expect(new URL(page.url()).pathname).toBe("/config");
	});

	test("non-dismissible drawer ignores Escape", async ({ page }) => {
		await page.goto("/config");
		await checkbox(page, "Dismissible").uncheck();
		await page.getByRole("button", { name: "Open drawer" }).click();
		await expect(page.getByRole("dialog")).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(1); // stayed open
	});

	test("scrolling content scrolls without closing the drawer", async ({ page }) => {
		await page.goto("/config");
		await checkbox(page, "Scrolling content").check();
		await page.getByRole("button", { name: "Open drawer" }).click();
		const dialog = page.getByRole("dialog").first();
		await expect(dialog).toBeVisible();
		await page.waitForTimeout(650);

		const body = dialog.locator(".body.scroll");
		await body.evaluate((el) => el.scrollTo(0, 200));
		await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
		await expect(dialog).toBeVisible(); // didn't close from the scroll gesture
	});
});
