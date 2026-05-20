// vite.config_secure.ts
/**
 * Hardened Vite configuration with CSP and security plugins
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    host: "localhost",
    https: false, // Use HTTPS via reverse proxy in production
  },

  build: {
    outDir: "dist",
    sourcemap: false, // Don't expose source maps in production
    minify: "terser", // Minify with Terser
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs
      },
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Security headers via Vite middleware (development only)
  middleware: [
    (req, res, next) => {
      // Content Security Policy
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: https:; " +
          "font-src 'self'; " +
          "connect-src 'self' http://localhost:8000 /api; " +
          "frame-ancestors 'none';",
      );

      // Prevent MIME type sniffing
      res.setHeader("X-Content-Type-Options", "nosniff");

      // Clickjacking protection
      res.setHeader("X-Frame-Options", "DENY");

      // XSS Protection
      res.setHeader("X-XSS-Protection", "1; mode=block");

      // Referrer Policy
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

      next();
    },
  ],
});
