import { test, expect } from "@playwright/test";

test.describe("Phase 2 — core open/close", () => {
	test("uncontrolled drawer opens from its trigger and portals to body", async ({ page }) => {
		await page.goto("/playground");

		// Closed initially.
		await expect(page.getByRole("dialog")).toHaveCount(0);

		await page.getByRole("button", { name: "Open uncontrolled" }).click();

		const dialog = page.getByRole("dialog").first();
		await expect(dialog).toBeVisible();
		await expect(dialog).toHaveAttribute("data-state", "open");

		// Portalled: the dialog is a (deep) child of <body>, not nested in <main>.
		const inMain = await dialog.evaluate((el) => !!el.closest("main"));
		expect(inMain).toBe(false);

		// a11y wiring: labelled by its title.
		const labelledby = await dialog.getAttribute("aria-labelledby");
		expect(labelledby).toBeTruthy();
		await expect(page.locator(`#${labelledby}`)).toHaveText("A bottom drawer");
	});

	test("closes via the Close button", async ({ page }) => {
		await page.goto("/playground");
		await page.getByRole("button", { name: "Open uncontrolled" }).click();
		await expect(page.getByRole("dialog").first()).toBeVisible();

		await page.getByRole("button", { name: "Close" }).first().click();
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	test("closes when the overlay is clicked (dismissible)", async ({ page }) => {
		await page.goto("/playground");
		await page.getByRole("button", { name: "Open uncontrolled" }).click();
		await expect(page.getByRole("dialog").first()).toBeVisible();

		await page.locator("[data-svaul-drawer-overlay]").click({ position: { x: 5, y: 5 } });
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	test("controlled drawer reflects bind:open both ways", async ({ page }) => {
		await page.goto("/playground");
		const toggle = page.getByRole("button", { name: /Toggle externally/ });

		await toggle.click();
		await expect(page.getByText("Open state lives in the parent")).toBeVisible();
		await expect(toggle).toHaveText(/true/);

		// Close from inside → parent state flips back to false.
		await page.getByRole("button", { name: "Close" }).first().click();
		await expect(page.getByText("Open state lives in the parent")).toHaveCount(0);
		await expect(toggle).toHaveText(/false/);
	});
});
