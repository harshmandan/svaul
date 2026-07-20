import { test, expect } from "@playwright/test";

test.describe("Phase 5 — a11y + viewport", () => {
	test("locks body scroll while open and restores it on close", async ({ page }) => {
		await page.goto("/test-suite");
		const overflowBefore = await page.evaluate(() => document.body.style.overflow);

		await page.getByRole("button", { name: "Open uncontrolled" }).click();
		await expect(page.getByRole("dialog").first()).toBeVisible();
		await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

		await page.getByRole("button", { name: "Close" }).first().click();
		await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(overflowBefore);
	});

	test("Escape closes the drawer", async ({ page }) => {
		await page.goto("/test-suite");
		await page.getByRole("button", { name: "Open uncontrolled" }).click();
		await expect(page.getByRole("dialog").first()).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	test("returns focus to the trigger on close", async ({ page }) => {
		await page.goto("/test-suite");
		const trigger = page.getByRole("button", { name: "Open uncontrolled" });
		await trigger.click();
		await expect(page.getByRole("dialog").first()).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(trigger).toBeFocused();
	});

	test("autoFocus moves focus into the drawer", async ({ page }) => {
		await page.goto("/test-suite");
		await page.getByRole("button", { name: "Open scaling drawer" }).click();
		await expect(page.getByPlaceholder("autofocused input")).toBeFocused();
	});

	test("scaleBackground transforms the page wrapper", async ({ page }) => {
		await page.goto("/test-suite");
		await page.getByRole("button", { name: "Open scaling drawer" }).click();
		await page.waitForTimeout(150);
		const transform = await page.evaluate(
			() => getComputedStyle(document.querySelector("[data-svaul-drawer-wrapper]")!).transform
		);
		expect(transform).not.toBe("none"); // scaled
	});

	test("opening a nested drawer displaces the parent", async ({ page }) => {
		await page.goto("/test-suite");
		await page.getByRole("button", { name: "Open scaling drawer" }).click();
		const parent = page.getByRole("dialog").first();
		await expect(parent).toBeVisible();
		await page.waitForTimeout(150);

		await page.getByRole("button", { name: "Open nested drawer" }).click();
		await page.waitForTimeout(200);

		// Parent now carries a scale(<1) transform from the nested displacement.
		const transform = await parent.evaluate((el) => getComputedStyle(el).transform);
		expect(transform).toMatch(/matrix/);
		const scale = Number.parseFloat(transform.match(/matrix\(([^,]+)/)?.[1] ?? "1");
		expect(scale).toBeLessThan(1);

		await expect(page.getByRole("dialog")).toHaveCount(2);
	});
});
