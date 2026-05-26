# CI/CD Guide: Build APK + GitHub Release

This repo is now configured with:
- EAS build profiles in `eas.json`
- GitHub Actions workflow in `.github/workflows/android-apk-release.yml`

## What this pipeline does

1. Runs on tag push like `v1.0.0` (or manually via workflow dispatch)
2. Builds an Android APK using EAS profile `preview`
3. Downloads the APK artifact from EAS
4. Creates/updates a GitHub Release and uploads the APK

## One-time setup (required)

1. Install and login to Expo locally:
   - `npm install -g eas-cli`
   - `eas login`

2. Link this project to EAS (if not already linked):
   - `eas init`

3. Commit the EAS project linkage if prompted in `app.json`.

4. In GitHub repo settings, add secret:
   - Name: `EXPO_TOKEN`
   - Value: token from `https://expo.dev/accounts/<your-account>/settings/access-tokens`

## How to trigger the pipeline

### Option A: Automatic on tag push

1. Commit and push your changes.
2. Create and push a tag:
   - `git tag v1.0.0`
   - `git push origin v1.0.0`

The workflow will start automatically and publish a GitHub Release for `v1.0.0`.

### Option B: Manual run

1. Open GitHub -> Actions -> `Build Android APK and Release`
2. Click `Run workflow`
3. Enter `release_tag` (example: `v1.0.1`)

## Where to find the APK

- GitHub: Releases page (APK attached to the release)
- GitHub Actions: workflow run artifacts/logs
- EAS dashboard: build details and history

## Notes

- `preview` profile builds APK (`android.buildType = "apk"`).
- `production` profile in `eas.json` is configured for app bundle (`aab`).
- If workflow fails with token/auth errors, verify `EXPO_TOKEN` and EAS project linkage.
