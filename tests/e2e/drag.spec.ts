import { test, expect, type Page } from "@playwright/test";

async function openUncontrolled(page: Page) {
	await page.goto("/test-suite");
	await page.getByRole("button", { name: "Open uncontrolled" }).click();
	const dialog = page.getByRole("dialog").first();
	await expect(dialog).toBeVisible();
	// shouldDrag blocks dragging within 500ms of opening — wait it out.
	await page.waitForTimeout(650);
	return dialog;
}

test.describe("Phase 3 — drag physics", () => {
	test("dragging down past the close threshold closes the drawer", async ({ page }) => {
		const dialog = await openUncontrolled(page);
		const box = (await dialog.boundingBox())!;
		const startX = box.x + box.width / 2;
		const startY = box.y + 16;

		await page.mouse.move(startX, startY);
		await page.mouse.down();
		// move down well past threshold, in steps
		for (let i = 1; i <= 6; i++) {
			await page.mouse.move(startX, startY + i * 40);
			await page.waitForTimeout(10);
		}
		await page.mouse.up();

		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	test("a small, slow drag snaps back open (reset)", async ({ page }) => {
		const dialog = await openUncontrolled(page);
		const box = (await dialog.boundingBox())!;
		const startX = box.x + box.width / 2;
		const startY = box.y + 16;

		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(startX, startY + 10);
		await page.mouse.move(startX, startY + 16);
		await page.waitForTimeout(300); // keep velocity low
		await page.mouse.up();

		// still open, and animates back toward the resting transform
		await expect(dialog).toBeVisible();
		await page.waitForTimeout(550);
		await expect(dialog).toBeVisible();
		const transform = await dialog.evaluate((el) => getComputedStyle(el).transform);
		// resting position ≈ identity (matrix(1,0,0,1,0,0)) or "none"
		expect(transform === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(transform)).toBe(true);
	});

	test("non-dismissible drawer does not close on a past-threshold drag", async ({ page }) => {
		await page.goto("/fixtures");
		await page.getByRole("button", { name: "Open non-dismissible" }).click();
		const dialog = page.getByRole("dialog").first();
		await expect(dialog).toBeVisible();
		await page.waitForTimeout(650);

		// A real, well-past-threshold downward flick — a dismissible drawer would close here.
		const box = (await dialog.boundingBox())!;
		const x = box.x + box.width / 2;
		const startY = box.y + 16;
		await page.mouse.move(x, startY);
		await page.mouse.down();
		for (let i = 1; i <= 6; i++) {
			await page.mouse.move(x, startY + i * 45);
			await page.waitForTimeout(8);
		}
		await page.mouse.up();

		// dismissible={false} → it must stay open…
		await expect(dialog).toBeVisible();
		// …and the imperative close() (force) still works.
		await page.getByTestId("force-close").click();
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});
});
