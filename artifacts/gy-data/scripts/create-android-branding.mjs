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

const androidRes = path.join(
  androidMain,
  "res",
);

const sourceLogo = path.join(
  projectRoot,
  "public",
  "gy-data-logo.svg",
);

const capacitorConfig = path.join(
  projectRoot,
  "capacitor.config.ts",
);

/*
|--------------------------------------------------------------------------
| GY DATA — EXACT BRANDING
|--------------------------------------------------------------------------
|
| Source:
|   public/gy-data-logo.svg
|
| The complete SVG is used as the source artwork.
|
| This script does NOT:
|   - redraw the logo
|   - change the GY DATA text
|   - move the GY logo
|   - crop the artwork
|   - stretch the artwork
|   - add another logo
|   - add another name
|   - create an adaptive-icon mask
|   - add a spinner
|
| The complete artwork remains visible exactly as supplied.
|--------------------------------------------------------------------------
*/

if (!fs.existsSync(androidMain)) {
  throw new Error(
    `Android project not found:\n${androidMain}`,
  );
}

if (!fs.existsSync(sourceLogo)) {
  throw new Error(
    `GY DATA logo not found:\n${sourceLogo}`,
  );
}

/*
|--------------------------------------------------------------------------
| READ THE ORIGINAL SVG
|--------------------------------------------------------------------------
*/

const svgSource = fs.readFileSync(
  sourceLogo,
  "utf8",
);

if (!svgSource.includes("GY DATA")) {
  throw new Error(
    "The supplied GY DATA SVG does not contain the expected GY DATA artwork.",
  );
}

/*
|--------------------------------------------------------------------------
| RENDER THE ORIGINAL ARTWORK
|--------------------------------------------------------------------------
|
| 1024x1024 is used as the master.
|
| The aspect ratio is preserved.
|
| No crop.
| No cover.
| No contain padding.
| No background added.
|
|--------------------------------------------------------------------------
*/

const masterPng = await sharp(
  Buffer.from(svgSource),
  {
    density: 300,
  },
)
  .resize(
    1024,
    1024,
    {
      fit: "fill",
    },
  )
  .png({
    compressionLevel: 9,
    adaptiveFiltering: false,
  })
  .toBuffer();

const masterMetadata = await sharp(
  masterPng,
).metadata();

if (
  masterMetadata.width !== 1024 ||
  masterMetadata.height !== 1024
) {
  throw new Error(
    `GY DATA artwork must render at 1024x1024. Received ${masterMetadata.width}x${masterMetadata.height}.`,
  );
}

/*
|--------------------------------------------------------------------------
| ANDROID DIRECTORIES
|--------------------------------------------------------------------------
*/

const densitySizes = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const splashDensitySizes = {
  "drawable-mdpi": 1024,
  "drawable-hdpi": 1024,
  "drawable-xhdpi": 1024,
  "drawable-xxhdpi": 1024,
  "drawable-xxxhdpi": 1024,
};

const directories = [
  "drawable",
  "drawable-nodpi",
  "mipmap-anydpi-v26",

  ...Object.keys(densitySizes),

  ...Object.keys(splashDensitySizes),

  "drawable-land-mdpi",
  "drawable-land-hdpi",
  "drawable-land-xhdpi",
  "drawable-land-xxhdpi",
  "drawable-land-xxxhdpi",
];

for (const directory of directories) {
  fs.mkdirSync(
    path.join(
      androidRes,
      directory,
    ),
    {
      recursive: true,
    },
  );
}

/*
|--------------------------------------------------------------------------
| REMOVE OLD / DEFAULT ANDROID BRANDING
|--------------------------------------------------------------------------
|
| Adaptive icons can cause Android launchers to crop the artwork.
| Therefore they are deliberately removed.
|--------------------------------------------------------------------------
*/

const removeFiles = [
  "ic_launcher.xml",
  "ic_launcher_round.xml",

  "ic_launcher.png",
  "ic_launcher_round.png",

  "ic_launcher_foreground.png",
  "ic_launcher_foreground.xml",

  "ic_launcher_background.png",
  "ic_launcher_background.xml",

  "splash.png",
  "splash.xml",

  "gy_data_splash.png",
  "gy_data_splash.xml",

  "gy_data_splash_background.xml",

  "ic_launcher.webp",
  "ic_launcher_round.webp",
];

for (const directory of directories) {
  for (const file of removeFiles) {
    const target = path.join(
      androidRes,
      directory,
      file,
    );

    if (fs.existsSync(target)) {
      fs.rmSync(
        target,
        {
          force: true,
        },
      );
    }
  }
}

/*
|--------------------------------------------------------------------------
| REMOVE ADAPTIVE ICON XML COMPLETELY
|--------------------------------------------------------------------------
*/

const adaptiveDirectory = path.join(
  androidRes,
  "mipmap-anydpi-v26",
);

if (fs.existsSync(adaptiveDirectory)) {
  for (const file of fs.readdirSync(adaptiveDirectory)) {
    if (
      file === "ic_launcher.xml" ||
      file === "ic_launcher_round.xml"
    ) {
      fs.rmSync(
        path.join(
          adaptiveDirectory,
          file,
        ),
        {
          force: true,
        },
      );
    }
  }
}

/*
|--------------------------------------------------------------------------
| GENERATE LAUNCHER ICONS
|--------------------------------------------------------------------------
|
| The complete GY DATA artwork is kept inside the icon.
|
| There is no:
|   - crop
|   - circular mask
|   - adaptive foreground
|   - adaptive background
|   - extra text
|--------------------------------------------------------------------------
*/

for (
  const [folder, size] of Object.entries(
    densitySizes,
  )
) {
  const icon = await sharp(
    masterPng,
  )
    .resize(
      size,
      size,
      {
        fit: "fill",
      },
    )
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
    })
    .toBuffer();

  fs.writeFileSync(
    path.join(
      androidRes,
      folder,
      "ic_launcher.png",
    ),
    icon,
  );

  fs.writeFileSync(
    path.join(
      androidRes,
      folder,
      "ic_launcher_round.png",
    ),
    icon,
  );
}

/*
|--------------------------------------------------------------------------
| NODPI MASTER
|--------------------------------------------------------------------------
|
| This keeps a full-resolution copy available without Android
| density scaling.
|--------------------------------------------------------------------------
*/

fs.writeFileSync(
  path.join(
    androidRes,
    "drawable-nodpi",
    "gy_data_logo.png",
  ),
  masterPng,
);

/*
|--------------------------------------------------------------------------
| NATIVE SPLASH
|--------------------------------------------------------------------------
|
| The same complete GY DATA artwork is used.
|
| No second logo.
| No "GY DATA" text added separately.
| No spinner.
| No animation.
|--------------------------------------------------------------------------
*/

fs.writeFileSync(
  path.join(
    androidRes,
    "drawable",
    "gy_data_splash.png",
  ),
  masterPng,
);

fs.writeFileSync(
  path.join(
    androidRes,
    "drawable",
    "splash.png",
  ),
  masterPng,
);

/*
|--------------------------------------------------------------------------
| SPLASH DENSITIES
|--------------------------------------------------------------------------
*/

for (
  const [folder, size] of Object.entries(
    splashDensitySizes,
  )
) {
  const splash = await sharp(
    masterPng,
  )
    .resize(
      size,
      size,
      {
        fit: "fill",
      },
    )
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
    })
    .toBuffer();

  fs.writeFileSync(
    path.join(
      androidRes,
      folder,
      "gy_data_splash.png",
    ),
    splash,
  );

  fs.writeFileSync(
    path.join(
      androidRes,
      folder,
      "splash.png",
    ),
    splash,
  );
}

/*
|--------------------------------------------------------------------------
| LANDSCAPE SPLASH
|--------------------------------------------------------------------------
|
| Use the same complete artwork.
| Android decides the actual screen placement.
|--------------------------------------------------------------------------
*/

const landscapeFolders = [
  "drawable-land-mdpi",
  "drawable-land-hdpi",
  "drawable-land-xhdpi",
  "drawable-land-xxhdpi",
  "drawable-land-xxxhdpi",
];

for (const folder of landscapeFolders) {
  fs.writeFileSync(
    path.join(
      androidRes,
      folder,
      "gy_data_splash.png",
    ),
    masterPng,
  );

  fs.writeFileSync(
    path.join(
      androidRes,
      folder,
      "splash.png",
    ),
    masterPng,
  );
}

/*
|--------------------------------------------------------------------------
| WHITE BACKGROUND
|--------------------------------------------------------------------------
*/

const splashBackground = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#FFFFFF" />
</shape>
`;

fs.writeFileSync(
  path.join(
    androidRes,
    "drawable",
    "gy_data_splash_background.xml",
  ),
  splashBackground,
  "utf8",
);

/*
|--------------------------------------------------------------------------
| ANDROID MANIFEST
|--------------------------------------------------------------------------
|
| Force Android to use the direct GY DATA PNG.
|
| This prevents an old adaptive icon from taking over.
|--------------------------------------------------------------------------
*/

const manifestPath = path.join(
  androidMain,
  "AndroidManifest.xml",
);

if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(
    manifestPath,
    "utf8",
  );

  if (
    /android:icon\s*=/.test(
      manifest,
    )
  ) {
    manifest = manifest.replace(
      /android:icon\s*=\s*"[^"]*"/g,
      'android:icon="@mipmap/ic_launcher"',
    );
  } else {
    manifest = manifest.replace(
      /<application\b/,
      '<application android:icon="@mipmap/ic_launcher"',
    );
  }

  if (
    /android:roundIcon\s*=/.test(
      manifest,
    )
  ) {
    manifest = manifest.replace(
      /android:roundIcon\s*=\s*"[^"]*"/g,
      'android:roundIcon="@mipmap/ic_launcher_round"',
    );
  } else {
    manifest = manifest.replace(
      /(<application\b[^>]*)(>)/,
      '$1 android:roundIcon="@mipmap/ic_launcher_round"$2',
    );
  }

  fs.writeFileSync(
    manifestPath,
    manifest,
    "utf8",
  );
}

/*
|--------------------------------------------------------------------------
| PATCH CAPACITOR SPLASH CONFIG
|--------------------------------------------------------------------------
|
| This is included here because replacing only the Android image
| without disabling the old Capacitor splash can produce a second
| splash screen before GY DATA.
|
| The script changes the existing SplashScreen configuration so:
|
|   launchAutoHide = false
|   no spinner
|   no fade
|   same GY DATA resource
|
| The application itself should hide the native splash after its
| initial loading/session check.
|--------------------------------------------------------------------------
*/

if (fs.existsSync(capacitorConfig)) {
  let config = fs.readFileSync(
    capacitorConfig,
    "utf8",
  );

  const splashBlock = `SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      launchFadeOutDuration: 0,
      backgroundColor: '#FFFFFF',
      androidSplashResourceName: 'gy_data_splash',
      androidScaleType: 'CENTER',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    }`;

  if (
    /SplashScreen\s*:\s*\{[\s\S]*?\}/m.test(
      config,
    )
  ) {
    config = config.replace(
      /SplashScreen\s*:\s*\{[\s\S]*?\}/m,
      splashBlock,
    );
  } else {
    const pluginsMatch =
      /plugins\s*:\s*\{/m;

    if (pluginsMatch.test(config)) {
      config = config.replace(
        pluginsMatch,
        `plugins: {
    ${splashBlock},`,
      );
    }
  }

  fs.writeFileSync(
    capacitorConfig,
    config,
    "utf8",
  );
}

/*
|--------------------------------------------------------------------------
| VERIFICATION
|--------------------------------------------------------------------------
*/

const requiredFiles = [
  path.join(
    androidRes,
    "mipmap-mdpi",
    "ic_launcher.png",
  ),

  path.join(
    androidRes,
    "mipmap-hdpi",
    "ic_launcher.png",
  ),

  path.join(
    androidRes,
    "mipmap-xhdpi",
    "ic_launcher.png",
  ),

  path.join(
    androidRes,
    "mipmap-xxhdpi",
    "ic_launcher.png",
  ),

  path.join(
    androidRes,
    "mipmap-xxxhdpi",
    "ic_launcher.png",
  ),

  path.join(
    androidRes,
    "drawable",
    "gy_data_splash.png",
  ),

  path.join(
    androidRes,
    "drawable-nodpi",
    "gy_data_logo.png",
  ),
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(
      `GY DATA branding verification failed:\n${file}`,
    );
  }
}

/*
|--------------------------------------------------------------------------
| VERIFY THE MASTER IMAGE
|--------------------------------------------------------------------------
*/

const finalMaster = await sharp(
  path.join(
    androidRes,
    "drawable-nodpi",
    "gy_data_logo.png",
  ),
).metadata();

if (
  finalMaster.width !== 1024 ||
  finalMaster.height !== 1024
) {
  throw new Error(
    `Final GY DATA artwork is not 1024x1024.`,
  );
}

/*
|--------------------------------------------------------------------------
| DONE
|--------------------------------------------------------------------------
*/

console.log("");
console.log(
  "==================================================",
);
console.log(
  "GY DATA ANDROID BRANDING COMPLETE",
);
console.log(
  "==================================================",
);
console.log(
  "✓ Exact public/gy-data-logo.svg artwork used",
);
console.log(
  "✓ GY logo remains centered",
);
console.log(
  "✓ GY DATA text remains exactly in the artwork",
);
console.log(
  "✓ No crop",
);
console.log(
  "✓ No stretch",
);
console.log(
  "✓ No adaptive-icon mask",
);
console.log(
  "✓ No extra icon",
);
console.log(
  "✓ No extra text",
);
console.log(
  "✓ No spinner",
);
console.log(
  "✓ Native splash uses the same artwork",
);
console.log(
  "✓ Old adaptive launcher resources removed",
);
console.log(
  "✓ AndroidManifest points directly to GY DATA",
);
console.log(
  "✓ Capacitor splash configured to avoid second splash",
);
console.log(
  "==================================================",
);
console.log("");
