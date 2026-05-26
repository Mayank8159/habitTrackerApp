# CI/CD Guide: Build APK + GitHub Release (No EAS)

This repository now uses a pure GitHub Actions pipeline:
- Workflow file: `.github/workflows/android-apk-release.yml`
- Build method: `expo prebuild` + Gradle `assembleRelease`
- Release method: GitHub Release attachment

## What the pipeline does

1. Triggers on tag push like `v1.0.0` (or manually via workflow dispatch).
2. Generates Android native project in CI using `npx expo prebuild --platform android`.
3. Builds APK in CI using Gradle: `android/app/build/outputs/apk/release/app-release.apk`.
4. Publishes a GitHub Release and uploads the APK.

## One-time setup

1. Ensure your repository has Actions enabled.
2. Ensure code is pushed to your GitHub default branch.
3. No Expo/EAS token is required for this workflow.

## How to trigger release

### Option A: Tag push (recommended)

1. Commit your changes.
2. Create and push a version tag:
   - `git tag v1.0.1`
   - `git push origin v1.0.1`

### Option B: Manual run

1. Open GitHub -> Actions -> `Build Android APK and Release`.
2. Click `Run workflow`.
3. Enter a `release_tag` like `v1.0.2`.

## Where to get the APK

1. GitHub -> Releases -> open the release tag.
2. Download the attached file: `habitsapp-<tag>.apk`.

## Common issues

1. Gradle build fails: check Java/Android logs in Actions run.
2. `app-release.apk` missing: verify `expo prebuild` and Gradle step both succeeded.
3. Release not created: confirm workflow has `contents: write` permission (already set in workflow).
