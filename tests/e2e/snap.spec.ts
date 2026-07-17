import { test, expect, type Page, type Locator } from "@playwright/test";

/** Current translateY (px) of an element from its computed transform matrix. */
async function translateY(el: Locator): Promise<number> {
	return el.evaluate((node) => {
		const t = getComputedStyle(node).transform;
		if (!t || t === "none") return 0;
		const m = t.match(/matrix\(([^)]+)\)/);
		if (m) return Number.parseFloat(m[1].split(", ")[5]);
		const m3 = t.match(/matrix3d\(([^)]+)\)/);
		return m3 ? Number.parseFloat(m3[1].split(", ")[13]) : 0;
	});
}

async function openSnap(page: Page) {
	await page.goto("/playground");
	await page.getByRole("button", { name: "Open snap drawer" }).click();
	const dialog = page.getByRole("dialog").first();
	await expect(dialog).toBeVisible();
	await page.waitForTimeout(750); // enter animation + shouldDrag open-gate
	return dialog;
}

test.describe("Phase 4 — snap points", () => {
	test("opens resting at the first snap point (0.4)", async ({ page }) => {
		const dialog = await openSnap(page);
		const vh = page.viewportSize()!.height;
		const ty = await translateY(dialog);
		// offset = vh - 0.4*vh = 0.6*vh
		expect(ty).toBeGreaterThan(0.6 * vh - 40);
		expect(ty).toBeLessThan(0.6 * vh + 40);
		await expect(page.getByText(/active: 0\.4/)).toBeVisible();
	});

	test("dragging up snaps to the full point (1) and updates bind:activeSnapPoint", async ({
		page
	}) => {
		const dialog = await openSnap(page);
		const box = (await dialog.boundingBox())!;
		const x = box.x + box.width / 2;
		const startY = box.y + 12;

		await page.mouse.move(x, startY);
		await page.mouse.down();
		for (let i = 1; i <= 6; i++) {
			await page.mouse.move(x, startY - i * 45);
			await page.waitForTimeout(8);
		}
		await page.mouse.up();
		await page.waitForTimeout(650);

		expect(await translateY(dialog)).toBeLessThan(40); // ≈ 0 (fully open)
		await expect(page.getByText(/active: 1/)).toBeVisible();
	});

	test("tapping the handle cycles to the next snap point", async ({ page }) => {
		const dialog = await openSnap(page);
		await page.locator("[data-svaul-drawer-handle]").click(); // tap, no drag
		await page.waitForTimeout(650);
		expect(await translateY(dialog)).toBeLessThan(40); // snapped to full (1)
		await expect(page.getByText(/active: 1/)).toBeVisible();
	});

	test("dragging down from the first point closes the drawer", async ({ page }) => {
		const dialog = await openSnap(page);
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
	});
});
