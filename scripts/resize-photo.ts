import { existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Shrink one or more photos in place before they go in public/.
 *
 * Every photo on the site — athlete headshots, event demo stills — is shown at
 * well under 600px on screen (see AthletePhoto.tsx, EventMedia.tsx), so a full
 * phone photo is pure waste. Worse, some phones save a shot as a very large,
 * high-bit-depth PNG even when it's named "photo.jpg", which is how a single
 * headshot ends up tens of megabytes.
 *
 *   npm run resize-photo -- public/athletes/pam.jpg
 *   npm run resize-photo -- public/athletes/pam.jpg public/athletes/nick.jpg
 *   npm run resize-photo -- public/athletes/pam.jpg --max=800 --quality=85
 *
 * Always re-encodes as a real JPEG at that path, whatever the source format —
 * every photo here already claims to be one, and JPEG is the right choice for
 * a photo (unlike the site's event GIFs, which stay GIFs on purpose). Sharp
 * does not carry EXIF over into the re-encode unless asked to, so this also
 * strips embedded metadata — GPS coordinates included — as a side effect.
 */

function flagValue(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = arg ? Number(arg.slice(arg.indexOf("=") + 1)) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("Usage: npm run resize-photo -- <file> [<file> ...] [--max=600] [--quality=82]");
    process.exit(1);
  }

  const max = flagValue("max", 600);
  const quality = flagValue("quality", 82);

  for (const file of files) {
    const full = path.resolve(file);
    if (!existsSync(full)) {
      console.error(`Skipping ${file}: not found.`);
      continue;
    }

    const beforeBytes = statSync(full).size;
    const buffer = await sharp(full)
      .rotate() // bake in EXIF orientation before it's stripped, so the photo doesn't end up sideways
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    await writeFile(full, buffer);

    console.log(`${file}: ${(beforeBytes / 1024 / 1024).toFixed(1)} MB -> ${(buffer.length / 1024).toFixed(0)} KB`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 
