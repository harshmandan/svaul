/** Platform sniffing, ported from vaul (browser.ts). All SSR-safe (return `false`). */

function testPlatform(re: RegExp): boolean {
	if (typeof window === "undefined" || window.navigator == null) return false;
	// navigator.userAgentData?.platform is the modern field; fall back to platform.
	const platform =
		(window.navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
			?.platform || window.navigator.platform;
	return re.test(platform);
}

function isMac(): boolean {
	return testPlatform(/^Mac/);
}
function isIPhone(): boolean {
	return testPlatform(/^iPhone/);
}
function isIPad(): boolean {
	return (
		testPlatform(/^iPad/) ||
		// iPadOS 13+ reports as Mac with touch points.
		(isMac() && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)
	);
}

export function isIOS(): boolean {
	return isIPhone() || isIPad();
}

export function isSafari(): boolean {
	if (typeof navigator === "undefined") return false;
	return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}
