// Regenerates the app icons and in-app logo from assets/logo-source.png. Run: node scripts/make-icons.mjs
import sharp from "sharp";

const SRC = "assets/logo-source.png";
const CX = 775, CY = 398; // centre of the folder-and-lock emblem in the 1536x1024 source
const WORDMARK_TOP = 622; // the "MyVault" lettering starts below this; icons show the emblem only

// Sample the dark navy below the tagline so transparent pixels and the covered wordmark match the artwork.
const probe = await sharp(SRC).extract({ left: 700, top: 900, width: 80, height: 20 }).stats();
const [r, g, b] = probe.channels.slice(0, 3).map((c) => Math.round(c.mean));
const BG = { r, g, b };
const hex = `rgb(${r},${g},${b})`;

const flat = () => sharp(SRC).flatten({ background: BG });

/** Square crop around the emblem, wordmark faded out into the background, resized to `out` px. */
async function emblem(side, out, file) {
  const left = Math.round(CX - side / 2), top = Math.max(0, Math.round(CY - side / 2));
  const base = await flat().extract({ left, top, width: side, height: side }).toBuffer();
  const y0 = WORDMARK_TOP - top, h = side - y0;
  // Cover the wordmark with the real background just under the emblem, stretched down, so there is no visible band.
  const cover = await flat().extract({ left, top: 628, width: side, height: 4 }).resize(side, h, { fit: "fill" }).blur(6).png().toBuffer();
  // sharp resizes before it composites, so flatten the overlay into a buffer first.
  const covered = await sharp(base).composite([{ input: cover, left: 0, top: y0 }]).png().toBuffer();
  await sharp(covered).resize(out, out).png({ compressionLevel: 9 }).toFile(file);
}

await emblem(640, 512, "public/icons/icon-512.png");
await emblem(640, 192, "public/icons/icon-192.png");
await emblem(780, 512, "public/icons/maskable-512.png"); // extra margin: platforms crop maskable icons to a circle/squircle
await emblem(640, 512, "app/icon.png"); // favicon / tab icon
await emblem(640, 180, "app/apple-icon.png");

// Full logo (emblem + wordmark + tagline) for the login card.
await flat().extract({ left: 370, top: 150, width: 800, height: 730 }).resize(520).png({ compressionLevel: 9 }).toFile("public/logo.png");
console.log("done, background", hex);
