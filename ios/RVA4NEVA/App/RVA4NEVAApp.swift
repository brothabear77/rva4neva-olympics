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
        let titleFont = UIFont.systemFont(ofSize: 17, weight: .bold, width: .condensed)
        let largeFont = UIFont.systemFont(ofSize: 34, weight: .bold, width: .condensed)
        nav.titleTextAttributes = [.foregroundColor: UIColor(Theme.paper), .font: titleFont]
        nav.largeTitleTextAttributes = [.foregroundColor: UIColor(Theme.paper), .font: largeFont]
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(appState)
                .tint(Theme.accent)
                .preferredColorScheme(.dark)
                .task { await appState.bootstrap() }
        }
    }
}
