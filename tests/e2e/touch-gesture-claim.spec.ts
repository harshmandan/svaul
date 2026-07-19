import { test, expect } from "@playwright/test";

/**
 * Regression guard for the touch-drag dropped-click fix.
 *
 * The bug: transforming the drawer content under the finger during a touch drag makes Chrome/Android
 * drop the synthesized `click` on the NEXT tap, so a swipe-dismiss left the trigger needing a second
 * tap. The cure is claiming the gesture with a non-passive `touchmove` preventDefault while dragging.
 *
 * NOTE: the *symptom* is NOT reproducible here — Chromium's touch emulation does not implement the
 * Android click-suppression, so an emulated swipe-then-tap always reopens on the first tap. This test
 * therefore guards the FIX MECHANISM instead: during a committed touch drag, our listener must
 * preventDefault the touchmove events. If the gesture-claim is ever removed, this fails.
 */
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test("a committed touch drag claims the gesture (preventDefaults touchmove)", async ({ page }) => {
	await page.goto("/playground");
	const client = await page.context().newCDPSession(page);

	await page.getByRole("button", { name: "Open uncontrolled" }).click();
	const dialog = page.getByRole("dialog").first();
	await expect(dialog).toBeVisible();
	await page.waitForTimeout(650); // let the enter animation settle

	// Record `defaultPrevented` on every touchmove (a document listener runs after the content's, so
	// it observes whether our handler called preventDefault).
	await page.evaluate(() => {
		(window as unknown as { __dp: boolean[] }).__dp = [];
		document.addEventListener("touchmove", (e) =>
			(window as unknown as { __dp: boolean[] }).__dp.push(e.defaultPrevented)
		);
	});

	const box = (await dialog.boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + 16;
	await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
	for (let i = 1; i <= 6; i++) {
		await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + i * 30 }] });
	}
	await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

	const flags = await page.evaluate(() => (window as unknown as { __dp: boolean[] }).__dp);
	// Once the drag commits, touchmove must be preventDefaulted — that's the click-drop fix.
	expect(flags.some((v) => v === true), `touchmove defaultPrevented flags: ${JSON.stringify(flags)}`).toBe(true);
});
