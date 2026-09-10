import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();

const logoPath = path.join(
  projectRoot,
  'public',
  'gy-data-logo.svg'
);

const androidRoot = path.join(
  projectRoot,
  'android',
  'app',
  'src',
  'main'
);

if (!fs.existsSync(logoPath)) {
  throw new Error(`GY DATA logo not found: ${logoPath}`);
}

if (!fs.existsSync(androidRoot)) {
  throw new Error(`Android project not found: ${androidRoot}`);
}

/*
 * Android launcher icon sizes
 */
const iconDirectories = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

/*
 * Generate normal launcher icons.
 */
for (const [directory, size] of iconDirectories) {
  const outputDirectory = path.join(
    androidRoot,
    'res',
    directory
  );

  fs.mkdirSync(outputDirectory, {
    recursive: true,
  });

  const launcherIcon = path.join(
    outputDirectory,
    'ic_launcher.png'
  );

  const roundLauncherIcon = path.join(
    outputDirectory,
    'ic_launcher_round.png'
  );

  await sharp(logoPath)
    .resize(size, size, {
      fit: 'contain',
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1,
      },
    })
    .png()
    .toFile(launcherIcon);

  await sharp(logoPath)
    .resize(size, size, {
      fit: 'contain',
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1,
      },
    })
    .png()
    .toFile(roundLauncherIcon);
}

/*
 * IMPORTANT:
 *
 * Capacitor creates an adaptive icon for Android 8+
 * using ic_launcher_foreground.xml.
 *
 * The generated Capacitor foreground is the old Wi-Fi
 * icon, so remove it and replace it with our actual
 * GY DATA artwork.
 */
const drawableV24Directory = path.join(
  androidRoot,
  'res',
  'drawable-v24'
);

const drawableDirectory = path.join(
  androidRoot,
  'res',
  'drawable'
);

fs.mkdirSync(drawableV24Directory, {
  recursive: true,
});

fs.mkdirSync(drawableDirectory, {
  recursive: true,
});

/*
 * Remove Capacitor's old Wi-Fi foreground resources.
 */
const oldForegroundXml = path.join(
  drawableV24Directory,
  'ic_launcher_foreground.xml'
);

const oldForegroundPng = path.join(
  drawableV24Directory,
  'ic_launcher_foreground.png'
);

if (fs.existsSync(oldForegroundXml)) {
  fs.unlinkSync(oldForegroundXml);
}

if (fs.existsSync(oldForegroundPng)) {
  fs.unlinkSync(oldForegroundPng);
}

/*
 * Also remove any previous foreground PNG in drawable.
 */
const oldDrawableForeground = path.join(
  drawableDirectory,
  'ic_launcher_foreground.png'
);

if (fs.existsSync(oldDrawableForeground)) {
  fs.unlinkSync(oldDrawableForeground);
}

/*
 * Create the actual GY DATA adaptive-icon foreground.
 *
 * We render the complete logo instead of the old Wi-Fi
 * vector so Android launcher displays:
 *
 *        GY
 *      GY DATA
 *     Endless Joy
 */
const adaptiveForeground = path.join(
  drawableDirectory,
  'ic_launcher_foreground.png'
);

await sharp(logoPath)
  .resize(432, 432, {
    fit: 'contain',
    background: {
      r: 255,
      g: 255,
      b: 255,
      alpha: 1,
    },
  })
  .png()
  .toFile(adaptiveForeground);

/*
 * Replace the adaptive icon XML.
 */
const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">

    <background android:drawable="@drawable/ic_launcher_background" />

    <foreground android:drawable="@drawable/ic_launcher_foreground" />

</adaptive-icon>
`;

const launcherXmlDirectory = path.join(
  androidRoot,
  'res',
  'mipmap-anydpi-v26'
);

fs.mkdirSync(launcherXmlDirectory, {
  recursive: true,
});

fs.writeFileSync(
  path.join(
    launcherXmlDirectory,
    'ic_launcher.xml'
  ),
  adaptiveIconXml,
  'utf8'
);

fs.writeFileSync(
  path.join(
    launcherXmlDirectory,
    'ic_launcher_round.xml'
  ),
  adaptiveIconXml,
  'utf8'
);

/*
 * Make sure the adaptive icon background is white.
 */
const backgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">

    <solid android:color="#FFFFFF" />

</shape>
`;

fs.writeFileSync(
  path.join(
    drawableDirectory,
    'ic_launcher_background.xml'
  ),
  backgroundXml,
  'utf8'
);

/*
 * Splash artwork.
 */
const splashDirectory = path.join(
  androidRoot,
  'res',
  'drawable'
);

const splashOutput = path.join(
  splashDirectory,
  'gy_data_splash.png'
);

await sharp(logoPath)
  .resize(1024, 1024, {
    fit: 'contain',
    background: {
      r: 255,
      g: 255,
      b: 255,
      alpha: 1,
    },
  })
  .png()
  .toFile(splashOutput);

console.log(
  'GY DATA launcher icon and splash branding generated successfully.'
);
