import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "192.168.1.11"],
};
export default config;
