// artifacts/gy-data/scripts/create-android-branding.mjs

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();

const androidMain = path.join(
  projectRoot,
  "android",
  "app",
  "src",
  "main",
);

const androidRes = path.join(androidMain, "res");

// PUT THE EXACT UPLOADED GY DATA IMAGE HERE:
// artifacts/gy-data/public/gy-data-icon.png
const sourceLogo = path.join(
  projectRoot,
  "public",
  "gy-data-icon.png",
);

if (!fs.existsSync(androidMain)) {
  throw new Error(
    `Android project not found:\n${androidMain}`,
  );
}

if (!fs.existsSync(sourceLogo)) {
  throw new Error(
    `GY DATA icon not found:\n${sourceLogo}\n\n` +
      `Place the exact GY DATA image as:\n` +
      `artifacts/gy-data/public/gy-data-icon.png`,
  );
}

/*
 * The supplied 2048x2048 GY DATA artwork is used directly.
 *
 * IMPORTANT:
 * - No redesign
 * - No SVG recreation
 * - No crop
 * - No stretch
 * - No adaptive foreground/background
 * - No extra text
 * - No extra logo
 *
 * The exact artwork is simply resized to Android launcher sizes.
 */

const source = await sharp(sourceLogo)
  .ensureAlpha()
  .resize(1024, 1024, {
    fit: "fill",
  })
  .png({
    compressionLevel: 9,
    adaptiveFiltering: false,
  })
  .toBuffer();

const metadata = await sharp(source).metadata();

if (
  metadata.width !== 1024 ||
  metadata.height !== 1024
) {
  throw new Error(
    `GY DATA icon must render as 1024x1024. ` +
      `Received ${metadata.width}x${metadata.height}.`,
  );
}

const densitySizes = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const directories = [
  "drawable",
  "drawable-nodpi",
  "mipmap-anydpi-v26",
  ...Object.keys(densitySizes),
];

for (const directory of directories) {
  fs.mkdirSync(
    path.join(androidRes, directory),
    {
      recursive: true,
    },
  );
}

/*
 * Remove Android adaptive launcher icons.
 *
 * This is intentional because you asked for the installed
 * app icon to display the supplied artwork itself rather than
 * Android rebuilding it from foreground/background layers.
 */

const oldLauncherFiles = [
  "ic_launcher.xml",
  "ic_launcher_round.xml",
  "ic_launcher_foreground.xml",
  "ic_launcher_background.xml",
  "ic_launcher.png",
  "ic_launcher_round.png",
  "ic_launcher.webp",
  "ic_launcher_round.webp",
];

for (const directory of directories) {
  for (const file of oldLauncherFiles) {
    const target = path.join(
      androidRes,
      directory,
      file,
    );

    if (fs.existsSync(target)) {
      fs.rmSync(target, {
        force: true,
      });
    }
  }
}

/*
 * Direct launcher PNGs.
 *
 * Both normal and round launcher resources point to
 * the SAME artwork.
 */

for (
  const [directory, size] of Object.entries(
    densitySizes,
  )
) {
  const icon = await sharp(source)
    .resize(size, size, {
      fit: "fill",
    })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
    })
    .toBuffer();

  fs.writeFileSync(
    path.join(
      androidRes,
      directory,
      "ic_launcher.png",
    ),
    icon,
  );

  fs.writeFileSync(
    path.join(
      androidRes,
      directory,
      "ic_launcher_round.png",
    ),
    icon,
  );
}

/*
 * Keep the exact artwork at full resolution too.
 */

fs.writeFileSync(
  path.join(
    androidRes,
    "drawable-nodpi",
    "gy_data_icon.png",
  ),
  source,
);

/*
 * AndroidManifest.xml
 *
 * Force the installed application launcher icon to use
 * the direct GY DATA PNG resource.
 */

const manifestPath = path.join(
  androidMain,
  "AndroidManifest.xml",
);

if (!fs.existsSync(manifestPath)) {
  throw new Error(
    `AndroidManifest.xml not found:\n${manifestPath}`,
  );
}

let manifest = fs.readFileSync(
  manifestPath,
  "utf8",
);

if (/android:icon\s*=/i.test(manifest)) {
  manifest = manifest.replace(
    /android:icon\s*=\s*"[^"]*"/i,
    'android:icon="@mipmap/ic_launcher"',
  );
} else {
  manifest = manifest.replace(
    /<application\b/i,
    '<application android:icon="@mipmap/ic_launcher"',
  );
}

if (/android:roundIcon\s*=/i.test(manifest)) {
  manifest = manifest.replace(
    /android:roundIcon\s*=\s*"[^"]*"/i,
    'android:roundIcon="@mipmap/ic_launcher_round"',
  );
} else {
  manifest = manifest.replace(
    /(<application\b[^>]*)(>)/i,
    '$1 android:roundIcon="@mipmap/ic_launcher_round"$2',
  );
}

fs.writeFileSync(
  manifestPath,
  manifest,
  "utf8",
);

/*
 * Verification
 */

const requiredFiles = [
  "mipmap-mdpi/ic_launcher.png",
  "mipmap-hdpi/ic_launcher.png",
  "mipmap-xhdpi/ic_launcher.png",
  "mipmap-xxhdpi/ic_launcher.png",
  "mipmap-xxxhdpi/ic_launcher.png",
  "mipmap-mdpi/ic_launcher_round.png",
  "mipmap-hdpi/ic_launcher_round.png",
  "mipmap-xhdpi/ic_launcher_round.png",
  "mipmap-xxhdpi/ic_launcher_round.png",
  "mipmap-xxxhdpi/ic_launcher_round.png",
  "drawable-nodpi/gy_data_icon.png",
];

for (const relativeFile of requiredFiles) {
  const file = path.join(
    androidRes,
    relativeFile,
  );

  if (!fs.existsSync(file)) {
    throw new Error(
      `Android branding verification failed:\n${file}`,
    );
  }
}

const finalIcon = await sharp(
  path.join(
    androidRes,
    "drawable-nodpi",
    "gy_data_icon.png",
  ),
).metadata();

if (
  finalIcon.width !== 1024 ||
  finalIcon.height !== 1024
) {
  throw new Error(
    `Final GY DATA icon is not 1024x1024.`,
  );
}

console.log(
  "GY DATA exact launcher icon generated successfully.",
);
console.log(
  "Source: public/gy-data-icon.png",
);
console.log(
  "Adaptive launcher icon intentionally disabled.",
);
console.log(
  "No crop, redesign, extra text, or extra logo applied.",
);
