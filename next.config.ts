import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Turbopack doesn't need explicit fallbacks – Node built-ins are excluded
  // from browser bundles automatically. The empty object silences the
  // "webpack config present but no turbopack config" warning.
  turbopack: {},
};

export default nextConfig;
