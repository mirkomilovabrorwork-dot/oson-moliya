import type { MetadataRoute } from "next";

/**
 * Web app manifest — this is what makes Oson Moliya installable on a phone.
 *
 * The `shortcuts` block is not decoration: it is the product requirement.
 * The owner's brief is "2 step menga 1 step kerak" — long-pressing the installed
 * icon must drop him straight into recording, not onto a home screen he then has
 * to navigate. Each shortcut carries its mode in the URL so the app can open in
 * that mode directly.
 *
 * Chrome's documented install criteria (web.dev/articles/install-criteria):
 * HTTPS, name or short_name, icons at 192px AND 512px, start_url, and a display
 * mode of fullscreen/standalone/minimal-ui/window-controls-overlay.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oson Moliya — Biznes moliyasi",
    short_name: "Oson Moliya",
    description:
      "Kirim va chiqimni ovoz bilan, chek rasmi bilan yoki qo'lda yozing.",
    // The installed icon must land on the microphone, not on the dashboard —
    // that IS the product requirement ("2 step menga 1 step kerak"). The
    // dashboard is one tap away from the capture screen; the reverse ordering
    // would spend the tap the app exists to remove.
    start_url: "/capture?mode=voice",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#15803d",
    lang: "uz",
    dir: "ltr",
    categories: ["finance", "business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Ovoz bilan yozish",
        short_name: "Ovoz",
        description: "Gapiring — biz yozib qo'yamiz",
        url: "/capture?mode=voice",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Chek rasmini olish",
        short_name: "Rasm",
        description: "Chekni suratga oling",
        url: "/capture?mode=photo",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Qo'lda yozish",
        short_name: "Qo'lda",
        description: "Summani o'zingiz kiriting",
        url: "/capture?mode=text",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
