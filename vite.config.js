import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // VITE_API_TARGET lo inyecta el Centro de Control con el puerto asignado al API; sin ella, el puerto histórico.
    proxy: { "/api": process.env.VITE_API_TARGET || "http://localhost:3001" },
  },
});
