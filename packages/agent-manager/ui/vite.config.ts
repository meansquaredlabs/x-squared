import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: "../dist/ui",
		emptyOutDir: true,
	},
	server: {
		proxy: {
			"/api": "http://localhost:3737",
			"/ws": { target: "ws://localhost:3737", ws: true },
		},
	},
});
