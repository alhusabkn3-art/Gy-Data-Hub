
 // Complete replacement for:
 // artifacts/gy-data/scripts/create-android-branding.mjs
 //
 // Uses the configured PNG when it is valid. If that file is missing or
 // corrupt, it falls back to the existing GY DATA JPEG in public/.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const androidMain = path.join(projectRoot, "android", "app", "src", "main");
const androidRes = path.join(androidMain, "res");
const publicDir = path.join(projectRoot, "public");

if (!fs.existsSync(androidMain)) {
  throw new Error(
    `Android project not found:\n${androidMain}\n` +
      "Run this script after Capacitor has added/synced the Android platform.",
  );
}

const sourceCandidates = [
  path.join(publicDir, "gy-data-icon.png"),
  path.join(publicDir, "Gemini_Generated_Image_c6c0wxc6c0wxc6c0.jpeg"),
];

let sourceLogo;
let sourceMetadata;
let lastSourceError;

for (const candidate of sourceCandidates) {
  if (!fs.existsSync(candidate)) continue;

  try {
    const metadata = await sharp(candidate, { failOn: "error" }).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Image metadata has no valid dimensions.");
    }

    sourceLogo = candidate;
    sourceMetadata = metadata;
    break;
  } catch (error) {
    lastSourceError = error;
    console.warn(
      `Ignoring invalid branding image: ${candidate}\n${error.message}`,
    );
  }
}

if (!sourceLogo) {
  throw new Error(
    "No valid GY DATA icon image was found.\n" +
      "Checked:\n" +
      sourceCandidates.map((file) => ` - ${file}`).join("\n") +
      (lastSourceError ? `\nLast image error: ${lastSourceError.message}` : ""),
  );
}

console.log(`Using GY DATA artwork: ${path.relative(projectRoot, sourceLogo)}`);
console.log(
  `Original image dimensions: ${sourceMetadata.width}x${sourceMetadata.height}`,
);

const sourceBuffer = await sharp(sourceLogo, { failOn: "error" })
  .rotate()
  .ensureAlpha()
  .resize(1024, 1024, {
    fit: "contain",
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })
  .png({ compressionLevel: 9, adaptiveFiltering: false })
  .toBuffer();

const normalizedMetadata = await sharp(sourceBuffer).metadata();

if (
  normalizedMetadata.format !== "png" ||
  normalizedMetadata.width !== 1024 ||
  normalizedMetadata.height !== 1024
) {
  throw new Error(
    `Normalized icon is invalid: format=${normalizedMetadata.format}, ` +
      `size=${normalizedMetadata.width}x${normalizedMetadata.height}`,
  );
}

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, "gy-data-icon.png"), sourceBuffer);

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
  fs.mkdirSync(path.join(androidRes, directory), { recursive: true });
}

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
    const target = path.join(androidRes, directory, file);

    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  }
}

for (const [directory, size] of Object.entries(densitySizes)) {
  const icon = await sharp(sourceBuffer)
    .resize(size, size, { fit: "fill" })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  fs.writeFileSync(
    path.join(androidRes, directory, "ic_launcher.png"),
    icon,
  );

  fs.writeFileSync(
    path.join(androidRes, directory, "ic_launcher_round.png"),
    icon,
  );
}

fs.writeFileSync(
  path.join(androidRes, "drawable-nodpi", "gy_data_icon.png"),
  sourceBuffer,
);

const manifestPath = path.join(androidMain, "AndroidManifest.xml");

if (!fs.existsSync(manifestPath)) {
  throw new Error(`AndroidManifest.xml not found:\n${manifestPath}`);
}

let manifest = fs.readFileSync(manifestPath, "utf8");

if (!/<application\b/i.test(manifest)) {
  throw new Error(`Could not find <application> in:\n${manifestPath}`);
}

if (/android:icon\s*=\s*"[^"]*"/i.test(manifest)) {
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

if (/android:roundIcon\s*=\s*"[^"]*"/i.test(manifest)) {
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

fs.writeFileSync(manifestPath, manifest, "utf8");

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
  const file = path.join(androidRes, relativeFile);

  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error(`Android branding verification failed:\n${file}`);
  }

  await sharp(file, { failOn: "error" }).metadata();
}

const finalIcon = await sharp(
  path.join(androidRes, "drawable-nodpi", "gy_data_icon.png"),
).metadata();

if (
  finalIcon.format !== "png" ||
  finalIcon.width !== 1024 ||
  finalIcon.height !== 1024
) {
  throw new Error(
    `Final GY DATA icon is invalid: ${finalIcon.format} ${finalIcon.width}x${finalIcon.height}`,
  );
}

console.log("GY DATA Android launcher branding generated successfully.");
console.log("Canonical source: public/gy-data-icon.png");
console.log("Validated launcher PNGs generated for all Android densities.");
