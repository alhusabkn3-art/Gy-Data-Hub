name: Build GY DATA Android

on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.17.1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"

      - name: Install dependencies
        run: pnpm install --no-frozen-lockfile

      - name: Install Capacitor
        working-directory: artifacts/gy-data
        run: |
          pnpm add @capacitor/core @capacitor/android
          pnpm add -D @capacitor/cli sharp

      - name: Build web application
        working-directory: artifacts/gy-data
        run: pnpm build

      - name: Remove old Android platform
        working-directory: artifacts/gy-data
        run: |
          rm -rf android

      - name: Add Android platform
        working-directory: artifacts/gy-data
        run: pnpm exec cap add android

      - name: Sync Capacitor
        working-directory: artifacts/gy-data
        run: pnpm exec cap sync android

      - name: Generate GY DATA branding
        working-directory: artifacts/gy-data
        run: pnpm create:android-branding

      - name: Verify old Wi-Fi icon is removed
        working-directory: artifacts/gy-data
        run: |
          if [ -f android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml ]; then
            echo "ERROR: Old Capacitor Wi-Fi icon still exists."
            exit 1
          fi

          if grep -R "wifi" android/app/src/main/res/drawable-v24 2>/dev/null; then
            echo "ERROR: Possible old Wi-Fi launcher resource found."
            exit 1
          fi

          echo "GY DATA launcher resources verified."

      - name: Make Gradle executable
        working-directory: artifacts/gy-data/android
        run: chmod +x gradlew

      - name: Clean Android build
        working-directory: artifacts/gy-data/android
        run: ./gradlew clean

      - name: Build APK
        working-directory: artifacts/gy-data/android
        run: ./gradlew assembleDebug

      - name: Build AAB
        working-directory: artifacts/gy-data/android
        run: ./gradlew bundleDebug

      - name: Verify APK exists
        run: |
          test -f artifacts/gy-data/android/app/build/outputs/apk/debug/app-debug.apk
          echo "APK created successfully."

      - name: Verify AAB exists
        run: |
          test -f artifacts/gy-data/android/app/build/outputs/bundle/debug/app-debug.aab
          echo "AAB created successfully."

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: gy-data-hub-apk
          path: artifacts/gy-data/android/app/build/outputs/apk/debug/app-debug.apk

      - name: Upload AAB
        uses: actions/upload-artifact@v4
        with:
          name: gy-data-hub-aab
          path: artifacts/gy-data/android/app/build/outputs/bundle/debug/app-debug.aab
