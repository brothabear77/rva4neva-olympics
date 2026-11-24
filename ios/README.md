# #rva4neva iOS app

A native SwiftUI app for iOS 18 and later. It talks to the site's JSON API, which is described in [`docs/api.md`](../docs/api.md).

## Run it

1. Start the site locally: `npm run db:up && npm run dev` (from the repo root).
2. Generate the Xcode project with `cd ios && xcodegen`. Install XcodeGen with `brew install xcodegen` if you don't have it. The `.xcodeproj` is generated and not committed.
3. Open `RVA4NEVA.xcodeproj` and run on a simulator. Debug builds talk to `http://localhost:3000`, and Release builds talk to production. Both URLs are set in `Config/*.xcconfig`.

## Run it on your iPhone

1. Copy `Config/Local.xcconfig.example` to `Config/Local.xcconfig`. The copy is git-ignored. Fill in two values:
   - `DEVELOPMENT_TEAM`: your Apple team ID. A free Personal Team works, but the app then stops opening after 7 days until you run it from Xcode again. A paid membership extends that to a year.
   - `API_BASE_URL`: your Mac's address on the Wi-Fi, for example `http://your-mac.local:3000`. The phone can't reach the Mac's `localhost`. Find the name under System Settings → General → Sharing → Local hostname.
2. Run `xcodegen` again, connect the phone (or pair it over Wi-Fi), pick it in Xcode, and press ⌘R.
3. The first time, iOS asks to allow local network access. Allow it, or the app can't reach the dev server.

Vlog uploads won't work this way, because their signed URLs point at S3Mock on `localhost:9090`. A Release build talks to production instead, but only once this API has been deployed there.

## Run the tests

From the command line:

```sh
xcodebuild test -project RVA4NEVA.xcodeproj -scheme RVA4NEVA \
  -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
```

## Layout

| Folder | What's in it |
|---|---|
| `App/` | App entry, tabs, `AppState` (session, flags, config) |
| `Networking/` | `APIClient` (bearer token, error mapping), `API` read functions, Keychain |
| `Models/` | Codable mirrors of the API's JSON |
| `Domain/` | `Scoring` and `Calculator`, ported from `src/lib/scoring.ts` and `calculator.ts` |
| `DesignSystem/` | The site's palette, fonts (Oswald for headings, Geist for text and numbers) and shared components |
| `Resources/Fonts/` | Static weights cut from the OFL variable fonts, with their licences |
| `Shared/` | `Loader` (loading, error and slow-wake states) and `.polling` (the equivalent of LiveRefresh) |
| `Features/` | One folder per tab |

If you change `src/lib/scoring.ts`, change `Domain/Scoring.swift` to match. `RVA4NEVATests/ScoringTests.swift` mirrors the cases in the Vitest file.
