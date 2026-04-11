import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Static export — Tauri loads local HTML files from ../out/
    output: "export",
    // Disable image optimization (not available in static export)
    images: {
        unoptimized: true,
    },
};

export default nextConfig;
