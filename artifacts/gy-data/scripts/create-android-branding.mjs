import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot =
  process.cwd();

const logoPath =
  path.join(
    projectRoot,
    'public',
    'gy-data-logo.svg',
  );

const androidMain =
  path.join(
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

const resDir =
  path.join(
    androidMain,
    'res',
  );

const drawableDir =
  path.join(
    resDir,
    'drawable',
  );

const drawableV24Dir =
  path.join(
    resDir,
    'drawable-v24',
  );

const adaptiveIconDir =
  path.join(
    resDir,
    'mipmap-anydpi-v26',
  );

const mipmapFolders = [
  'mipmap-mdpi',
  'mipmap-hdpi',
  'mipmap-xhdpi',
  'mipmap-xxhdpi',
  'mipmap-xxxhdpi',
];

fs.mkdirSync(
  drawableDir,
  {
    recursive: true,
  },
);

fs.mkdirSync(
  drawableV24Dir,
  {
    recursive: true,
  },
);

fs.mkdirSync(
  adaptiveIconDir,
  {
    recursive: true,
  },
);

for (
  const folder of mipmapFolders
) {
  fs.mkdirSync(
    path.join(
      resDir,
      folder,
    ),
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

const oldFiles = [
  'ic_launcher_foreground.xml',
  'ic_launcher_foreground.png',
  'ic_launcher_background.xml',
  'ic_launcher_background.png',
  'splash.png',
  'splash.xml',
  'gy_data_splash.png',
  'gy_data_splash_background.xml',
];

for (
  const fileName of oldFiles
) {
  const locations = [
    path.join(
      drawableDir,
      fileName,
    ),
    path.join(
      drawableV24Dir,
      fileName,
    ),
  ];

  for (
    const filePath of locations
  ) {
    if (
      fs.existsSync(
        filePath,
      )
    ) {
      fs.unlinkSync(
        filePath,
      );
    }
  }
}

/*
|--------------------------------------------------------------------------
| Remove old adaptive icon files
|--------------------------------------------------------------------------
*/

for (
  const fileName of [
    'ic_launcher.xml',
    'ic_launcher_round.xml',
  ]
) {
  const filePath =
    path.join(
      adaptiveIconDir,
      fileName,
    );

  if (
    fs.existsSync(
      filePath,
    )
  ) {
    fs.unlinkSync(
      filePath,
    );
  }
}

/*
|--------------------------------------------------------------------------
| Legacy launcher icons
|--------------------------------------------------------------------------
|
| The whole GY DATA logo is placed exactly in
| the center of every icon canvas.
|
*/

const iconSizes = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

for (
  const [folder, size] of iconSizes
) {
  const outputDir =
    path.join(
      resDir,
      folder,
    );

  const launcherPath =
    path.join(
      outputDir,
      'ic_launcher.png',
    );

  const roundLauncherPath =
    path.join(
      outputDir,
      'ic_launcher_round.png',
    );

  /*
   * Keep the logo centered.
   *
   * contain means the complete logo remains
   * visible and no edge gets cut.
   */
  await sharp(
    logoPath,
  )
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

  await sharp(
    logoPath,
  )
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
|
| Android adaptive icons have a safe area.
|
| We intentionally make the GY DATA logo smaller
| than the full adaptive canvas and center it.
|
| This prevents:
|
| - left/right clipping
| - top/bottom clipping
| - logo shifting
| - part of the logo disappearing
|
*/

const adaptiveCanvasSize =
  432;

const artworkSize =
  300;

const artworkBuffer =
  await sharp(
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

const foregroundPath =
  path.join(
    drawableDir,
    'ic_launcher_foreground.png',
  );

await sharp({
  create: {
    width:
      adaptiveCanvasSize,

    height:
      adaptiveCanvasSize,

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
      input:
        artworkBuffer,

      left:
        Math.round(
          (
            adaptiveCanvasSize -
            artworkSize
          ) / 2,
        ),

      top:
        Math.round(
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
| Native splash
|--------------------------------------------------------------------------
|
| Same GY DATA logo.
| White background.
| Centered.
| No stretching.
| No side cropping.
|
*/

const splashPath =
  path.join(
    drawableDir,
    'gy_data_splash.png',
  );

await sharp(
  logoPath,
)
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
    splashPath,
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
  'GY DATA branding generated: centered launcher icon, adaptive icon and centered splash.',
);
