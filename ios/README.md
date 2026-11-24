# #rva4neva iOS app

A native SwiftUI app for iOS 18 and later. It talks to the site's JSON API, which is described in [`docs/api.md`](../docs/api.md).

## Run it

1. Start the site locally: `npm run db:up && npm run dev` (from the repo root).
2. Generate the Xcode project with `cd ios && xcodegen`. Install XcodeGen with `brew install xcodegen` if you don't have it. The `.xcodeproj` is generated and not committed.
3. Open `RVA4NEVA.xcodeproj` and run on a simulator. Debug builds talk to `http://localhost:3000`, and Release builds talk to production. Both URLs are set in `Config/*.xcconfig`.

Run the tests from the command line:

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
| `DesignSystem/` | The site's palette and shared components |
| `Shared/` | `Loader` (loading, error and slow-wake states) and `.polling` (the equivalent of LiveRefresh) |
| `Features/` | One folder per tab |

If you change `src/lib/scoring.ts`, change `Domain/Scoring.swift` to match. `RVA4NEVATests/ScoringTests.swift` mirrors the cases in the Vitest file.
