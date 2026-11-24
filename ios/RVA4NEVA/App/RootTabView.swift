import SwiftUI

/// The site's nav (src/lib/site.ts NAV) as tabs. Everything that depends on who you are
/// (the Athletes pages, Submit Results, Admin, your profile) lives under More.
struct RootTabView: View {
    var body: some View {
        TabView {
            Tab("Home", systemImage: "flame") {
                NavigationStack { HomeView() }
            }
            Tab("Leaderboard", systemImage: "trophy") {
                NavigationStack { LeaderboardView() }
            }
            Tab("Events", systemImage: "stopwatch") {
                NavigationStack { EventsView() }
            }
            Tab("Info", systemImage: "info.circle") {
                NavigationStack { InfoView() }
            }
            Tab("More", systemImage: "person.crop.circle") {
                NavigationStack { MoreView() }
            }
        }
    }
}
