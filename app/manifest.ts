import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyVault",
    short_name: "MyVault",
    description: "Private zero-knowledge secrets vault",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#050d26", // the logo's navy, shown on the launch splash
    theme_color: "#4f46e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
