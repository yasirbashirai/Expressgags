/** Web app manifest for the installable driver app (scope /driver only). */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "Express Bags Driver",
      short_name: "EB Driver",
      description: "Express Bags driver jobs, scans and proof of delivery.",
      start_url: "/driver",
      scope: "/driver",
      display: "standalone",
      orientation: "portrait",
      background_color: "#002858",
      theme_color: "#002858",
      icons: [
        { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
