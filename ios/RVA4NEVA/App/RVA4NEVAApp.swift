import SwiftUI

@main
struct RVA4NEVAApp: App {
    @State private var appState = AppState()

    init() {
        // Bar and tab colours to match the site's ink background.
        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = UIColor(Theme.ink)
        nav.shadowColor = .clear
        // Oswald, scaled for Dynamic Type like the rest of the text.
        let oswald = { (size: CGFloat, style: UIFont.TextStyle) -> UIFont in
            let base = UIFont(name: "Oswald-Bold", size: size) ?? .systemFont(ofSize: size, weight: .bold)
            return UIFontMetrics(forTextStyle: style).scaledFont(for: base)
        }
        let titleFont = oswald(19, .headline)
        let largeFont = oswald(34, .largeTitle)
        nav.titleTextAttributes = [.foregroundColor: UIColor(Theme.paper), .font: titleFont]
        nav.largeTitleTextAttributes = [.foregroundColor: UIColor(Theme.paper), .font: largeFont]
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(appState)
                .font(.geist(.body))
                .tint(Theme.accent)
                .preferredColorScheme(.dark)
                .task { await appState.bootstrap() }
                .alert("You've been signed out", isPresented: $appState.sessionExpiredNotice) {
                    Button("OK", role: .cancel) {}
                } message: {
                    Text("Your session ended, perhaps because your password changed or it expired. Sign in again from More.")
                }
        }
    }
}
