import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();

const logoPath = path.join(
  projectRoot,
  'public',
  'gy-data-logo.svg',
);

const androidMain = path.join(
  projectRoot,
  'android',
  'app',
  'src',
  'main',
);

if (!fs.existsSync(logoPath)) {
  throw new Error(
    `GY DATA logo not found: ${logoPath}`,
  );
}

if (!fs.existsSync(androidMain)) {
  throw new Error(
    `Android project not found: ${androidMain}`,
  );
}

const resDir = path.join(
  androidMain,
  'res',
);

const drawableDir = path.join(
  resDir,
  'drawable',
);

const adaptiveIconDir = path.join(
  resDir,
  'mipmap-anydpi-v26',
);

const splashDensityFolders = [
  'drawable-mdpi',
  'drawable-hdpi',
  'drawable-xhdpi',
  'drawable-xxhdpi',
  'drawable-xxxhdpi',
  'drawable-land-mdpi',
  'drawable-land-hdpi',
  'drawable-land-xhdpi',
  'drawable-land-xxhdpi',
  'drawable-land-xxxhdpi',
];

const mipmapFolders = [
  'mipmap-mdpi',
  'mipmap-hdpi',
  'mipmap-xhdpi',
  'mipmap-xxhdpi',
  'mipmap-xxxhdpi',
];

fs.mkdirSync(drawableDir, {
  recursive: true,
});

fs.mkdirSync(adaptiveIconDir, {
  recursive: true,
});

for (const folder of mipmapFolders) {
  fs.mkdirSync(
    path.join(resDir, folder),
    {
      recursive: true,
    },
  );
}

for (const folder of splashDensityFolders) {
  fs.mkdirSync(
    path.join(resDir, folder),
    {
      recursive: true,
    },
  );
}

/*
|--------------------------------------------------------------------------
| Remove old generated branding
|--------------------------------------------------------------------------
*/

const oldBrandingFiles = [
  'ic_launcher_foreground.xml',
  'ic_launcher_foreground.png',
  'ic_launcher_background.xml',
  'ic_launcher_background.png',
  'splash.png',
  'splash.xml',
  'gy_data_splash.png',
  'gy_data_splash_background.xml',
];

const cleanupDirectories = [
  drawableDir,
  adaptiveIconDir,
  ...splashDensityFolders.map(
    (folder) =>
      path.join(
        resDir,
        folder,
      ),
  ),
  ...mipmapFolders.map(
    (folder) =>
      path.join(
        resDir,
        folder,
      ),
  ),
];

for (const directory of cleanupDirectories) {
  fs.mkdirSync(directory, {
    recursive: true,
  });
}

for (const fileName of oldBrandingFiles) {
  for (const directory of cleanupDirectories) {
    const filePath = path.join(
      directory,
      fileName,
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

/*
|--------------------------------------------------------------------------
| Remove old adaptive icon XML
|--------------------------------------------------------------------------
*/

for (const fileName of [
  'ic_launcher.xml',
  'ic_launcher_round.xml',
]) {
  const filePath = path.join(
    adaptiveIconDir,
    fileName,
  );

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/*
|--------------------------------------------------------------------------
| Legacy launcher icons
|--------------------------------------------------------------------------
*/

const iconSizes = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

for (const [folder, size] of iconSizes) {
  const outputDir = path.join(
    resDir,
    folder,
  );

  const launcherPath = path.join(
    outputDir,
    'ic_launcher.png',
  );

  const roundLauncherPath = path.join(
    outputDir,
    'ic_launcher_round.png',
  );

  await sharp(logoPath)
    .resize(
      size,
      size,
      {
        fit: 'contain',
        position: 'center',
        background: {
          r: 255,
          g: 255,
          b: 255,
          alpha: 1,
        },
      },
    )
    .png()
    .toFile(
      launcherPath,
    );

  await sharp(logoPath)
    .resize(
      size,
      size,
      {
        fit: 'contain',
        position: 'center',
        background: {
          r: 255,
          g: 255,
          b: 255,
          alpha: 1,
        },
      },
    )
    .png()
    .toFile(
      roundLauncherPath,
    );
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
    'ic_launcher_background.xml',
  ),
  backgroundXml,
  'utf8',
);

/*
|--------------------------------------------------------------------------
| Adaptive icon foreground
|--------------------------------------------------------------------------
*/

const adaptiveCanvasSize = 432;
const artworkSize = 300;

const artworkBuffer = await sharp(
  logoPath,
)
  .resize(
    artworkSize,
    artworkSize,
    {
      fit: 'contain',
      position: 'center',
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1,
      },
    },
  )
  .png()
  .toBuffer();

const foregroundPath = path.join(
  drawableDir,
  'ic_launcher_foreground.png',
);

await sharp({
  create: {
    width: adaptiveCanvasSize,
    height: adaptiveCanvasSize,
    channels: 4,
    background: {
      r: 255,
      g: 255,
      b: 255,
      alpha: 0,
    },
  },
})
  .composite([
    {
      input: artworkBuffer,
      left: Math.round(
        (
          adaptiveCanvasSize -
          artworkSize
        ) / 2,
      ),
      top: Math.round(
        (
          adaptiveCanvasSize -
          artworkSize
        ) / 2,
      ),
    },
  ])
  .png()
  .toFile(
    foregroundPath,
  );

/*
|--------------------------------------------------------------------------
| Adaptive icon XML
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
    'ic_launcher.xml',
  ),
  adaptiveIconXml,
  'utf8',
);

fs.writeFileSync(
  path.join(
    adaptiveIconDir,
    'ic_launcher_round.xml',
  ),
  adaptiveIconXml,
  'utf8',
);

/*
|--------------------------------------------------------------------------
| Default splash resource
|--------------------------------------------------------------------------
|
| IMPORTANT:
| Only splash.png is created here.
| splash.xml is deliberately NOT created,
| to prevent duplicate Android resources.
|--------------------------------------------------------------------------
*/

await sharp(logoPath)
  .resize(
    1024,
    1024,
    {
      fit: 'contain',
      position: 'center',
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1,
      },
    },
  )
  .png()
  .toFile(
    path.join(
      drawableDir,
      'splash.png',
    ),
  );

/*
|--------------------------------------------------------------------------
| Density splash resources
|--------------------------------------------------------------------------
*/

const splashSizes = [
  ['drawable-mdpi', 480, 480],
  ['drawable-hdpi', 720, 720],
  ['drawable-xhdpi', 960, 960],
  ['drawable-xxhdpi', 1440, 1440],
  ['drawable-xxxhdpi', 1920, 1920],
];

for (const [folder, width, height] of splashSizes) {
  const outputDir = path.join(
    resDir,
    folder,
  );

  await sharp(logoPath)
    .resize(
      width,
      height,
      {
        fit: 'contain',
        position: 'center',
        background: {
          r: 255,
          g: 255,
          b: 255,
          alpha: 1,
        },
      },
    )
    .png()
    .toFile(
      path.join(
        outputDir,
        'splash.png',
      ),
    );
}

/*
|--------------------------------------------------------------------------
| Landscape splash resources
|--------------------------------------------------------------------------
*/

const landscapeSplashSizes = [
  ['drawable-land-mdpi', 800, 480],
  ['drawable-land-hdpi', 1280, 720],
  ['drawable-land-xhdpi', 1600, 960],
  ['drawable-land-xxhdpi', 1920, 1280],
  ['drawable-land-xxxhdpi', 2560, 1600],
];

for (
  const [folder, width, height]
  of landscapeSplashSizes
) {
  const outputDir = path.join(
    resDir,
    folder,
  );

  await sharp(logoPath)
    .resize(
      width,
      height,
      {
        fit: 'contain',
        position: 'center',
        background: {
          r: 255,
          g: 255,
          b: 255,
          alpha: 1,
        },
      },
    )
    .png()
    .toFile(
      path.join(
        outputDir,
        'splash.png',
      ),
    );
}

/*
|--------------------------------------------------------------------------
| GY DATA native splash
|--------------------------------------------------------------------------
*/

await sharp(logoPath)
  .resize(
    1024,
    1024,
    {
      fit: 'contain',
      position: 'center',
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1,
      },
    },
  )
  .png()
  .toFile(
    path.join(
      drawableDir,
      'gy_data_splash.png',
    ),
  );

/*
|--------------------------------------------------------------------------
| Splash background
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
    'gy_data_splash_background.xml',
  ),
  splashBackgroundXml,
  'utf8',
);

console.log(
  'GY DATA branding generated successfully.',
);

console.log(
  'Centered launcher icons created.',
);

console.log(
  'Adaptive launcher icons created.',
);

console.log(
  'Default drawable/splash.png created.',
);

console.log(
  'Density splash resources created.',
);

console.log(
  'Landscape splash resources created.',
);

console.log(
  'Centered GY DATA native splash created.',
);
