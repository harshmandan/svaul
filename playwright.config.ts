import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "tests/e2e",
	timeout: 15_000,
	fullyParallel: true,
	use: {
		baseURL: "http://localhost:4173"
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	// Use a production build + preview for deterministic runs (the dev server's HMR /
	// dependency re-optimization makes cold first loads flaky).
	webServer: {
		command: "vite build && vite preview --port 4173",
		port: 4173,
		reuseExistingServer: true,
		timeout: 120_000
	}
});
