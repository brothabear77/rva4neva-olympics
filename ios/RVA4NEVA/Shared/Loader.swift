import SwiftUI

/// One screen's data: loads it, keeps the last good copy while refreshing, and says
/// when the first load is slow (a paused database waking up) rather than just spinning.
@MainActor
@Observable
final class Loader<Value: Sendable> {
    private(set) var value: Value?
    private(set) var error: String?
    private(set) var isLoading = false
    /// True once a first load has taken long enough that it's worth explaining.
    private(set) var isSlow = false

    private let fetch: @Sendable () async throws -> Value

    init(_ fetch: @escaping @Sendable () async throws -> Value) {
        self.fetch = fetch
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false; isSlow = false }

        let slowTimer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(3))
            if !Task.isCancelled { self?.isSlow = true }
        }
        defer { slowTimer.cancel() }

        do {
            value = try await fetch()
            error = nil
        } catch is CancellationError {
            // Left the screen mid-load; keep what we had.
        } catch let urlError as URLError where urlError.code == .cancelled {
            // Same, from URLSession.
        } catch {
            // A background refresh that fails keeps showing the last good data.
            self.error = error.localizedDescription
        }
    }
}

/// Shows a Loader's value, or a spinner / error for the first load.
struct LoadingView<Value: Sendable, Content: View>: View {
    let loader: Loader<Value>
    @ViewBuilder let content: (Value) -> Content

    var body: some View {
        if let value = loader.value {
            content(value)
        } else if let error = loader.error {
            ContentUnavailableView {
                Label("Couldn't load this", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") { Task { await loader.load() } }.buttonStyle(.borderedProminent)
            }
        } else {
            VStack(spacing: 12) {
                ProgressView().tint(Theme.accent)
                if loader.isSlow {
                    Text("Waking up the scoreboard…").font(.footnote).foregroundStyle(Theme.muted)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// Re-runs `action` every `interval` while the app is in the foreground, like the
/// site's LiveRefresh (src/components/LiveRefresh.tsx), which pauses in hidden tabs.
struct Polling: ViewModifier {
    let interval: Duration
    let action: @MainActor @Sendable () async -> Void
    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content.task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled else { break }
                await action()
            }
        }
    }
}

extension View {
    func polling(every interval: Duration, _ action: @escaping @MainActor @Sendable () async -> Void) -> some View {
        modifier(Polling(interval: interval, action: action))
    }
}
