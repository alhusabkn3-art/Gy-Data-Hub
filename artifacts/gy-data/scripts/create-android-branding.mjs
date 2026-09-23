import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();

const logoPath = path.join(
  projectRoot,
  "public",
  "gy-data-logo.svg"
);

const androidMain = path.join(
  projectRoot,
  "android",
  "app",
  "src",
  "main"
);

if (!fs.existsSync(logoPath)) {
  throw new Error(
    `GY DATA logo not found: ${logoPath}`
  );
}

if (!fs.existsSync(androidMain)) {
  throw new Error(
    `Android project not found: ${androidMain}`
  );
}

const resDir = path.join(
  androidMain,
  "res"
);

const drawableDir = path.join(
  resDir,
  "drawable"
);

const drawableV24Dir = path.join(
  resDir,
  "drawable-v24"
);

const adaptiveIconDir = path.join(
  resDir,
  "mipmap-anydpi-v26"
);

const mipmapFolders = [
  "mipmap-mdpi",
  "mipmap-hdpi",
  "mipmap-xhdpi",
  "mipmap-xxhdpi",
  "mipmap-xxxhdpi"
];

fs.mkdirSync(
  drawableDir,
  {
    recursive: true
  }
);

fs.mkdirSync(
  drawableV24Dir,
  {
    recursive: true
  }
);

fs.mkdirSync(
  adaptiveIconDir,
  {
    recursive: true
  }
);

for (const folder of mipmapFolders) {
  fs.mkdirSync(
    path.join(resDir, folder),
    {
      recursive: true
    }
  );
}

/*
|--------------------------------------------------------------------------
| Remove Capacitor default launcher resources
|--------------------------------------------------------------------------
*/

const filesToRemove = [
  path.join(
    drawableDir,
    "ic_launcher_foreground.xml"
  ),

  path.join(
    drawableDir,
    "ic_launcher_foreground.png"
  ),

  path.join(
    drawableV24Dir,
    "ic_launcher_foreground.xml"
  ),

  path.join(
    drawableV24Dir,
    "ic_launcher_foreground.png"
  ),

  path.join(
    drawableDir,
    "splash.png"
  ),

  path.join(
    drawableV24Dir,
    "splash.png"
  ),

  path.join(
    drawableDir,
    "splash.xml"
  ),

  path.join(
    drawableV24Dir,
    "splash.xml"
  )
];

for (const file of filesToRemove) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

/*
|--------------------------------------------------------------------------
| Launcher icons
|--------------------------------------------------------------------------
*/

const iconSizes = [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192]
];

for (const [folder, size] of iconSizes) {
  const outputDir = path.join(
    resDir,
    folder
  );

  const launcherPath = path.join(
    outputDir,
    "ic_launcher.png"
  );

  const roundLauncherPath = path.join(
    outputDir,
    "ic_launcher_round.png"
  );

  await sharp(logoPath)
    .resize(size, size, {
      fit: "contain",
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1
      }
    })
    .png()
    .toFile(launcherPath);

  await sharp(logoPath)
    .resize(size, size, {
      fit: "contain",
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1
      }
    })
    .png()
    .toFile(roundLauncherPath);
}

/*
|--------------------------------------------------------------------------
| Adaptive icon background
|--------------------------------------------------------------------------
*/

const backgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">

    <solid android:color="#FFFFFF" />

</shape>
`;

fs.writeFileSync(
  path.join(
    drawableDir,
    "ic_launcher_background.xml"
  ),
  backgroundXml,
  "utf8"
);

/*
|--------------------------------------------------------------------------
| Adaptive icon foreground
|--------------------------------------------------------------------------
*/

const foregroundPath = path.join(
  drawableDir,
  "ic_launcher_foreground.png"
);

await sharp(logoPath)
  .resize(432, 432, {
    fit: "contain",
    background: {
      r: 255,
      g: 255,
      b: 255,
      alpha: 0
    }
  })
  .png()
  .toFile(foregroundPath);

/*
|--------------------------------------------------------------------------
| Android adaptive launcher icon
|--------------------------------------------------------------------------
*/

const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">

    <background
        android:drawable="@drawable/ic_launcher_background" />

    <foreground
        android:drawable="@drawable/ic_launcher_foreground" />

</adaptive-icon>
`;

fs.writeFileSync(
  path.join(
    adaptiveIconDir,
    "ic_launcher.xml"
  ),
  adaptiveIconXml,
  "utf8"
);

fs.writeFileSync(
  path.join(
    adaptiveIconDir,
    "ic_launcher_round.xml"
  ),
  adaptiveIconXml,
  "utf8"
);

/*
|--------------------------------------------------------------------------
| Native splash artwork
|--------------------------------------------------------------------------
*/

const splashPath = path.join(
  drawableDir,
  "gy_data_splash.png"
);

await sharp(logoPath)
  .resize(1024, 1024, {
    fit: "contain",
    background: {
      r: 255,
      g: 255,
      b: 255,
      alpha: 1
    }
  })
  .png()
  .toFile(splashPath);

/*
|--------------------------------------------------------------------------
| Native splash background
|--------------------------------------------------------------------------
*/

const splashBackgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">

    <solid android:color="#FFFFFF" />

</shape>
`;

fs.writeFileSync(
  path.join(
    drawableDir,
    "gy_data_splash_background.xml"
  ),
  splashBackgroundXml,
  "utf8"
);

console.log(
  "GY DATA Android launcher, adaptive icon and splash branding generated successfully."
);
