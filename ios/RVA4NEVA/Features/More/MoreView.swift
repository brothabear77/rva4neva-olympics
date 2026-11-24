import SwiftUI

/// Your account, and the pages that depend on who you are: the Athletes pages for
/// members, Submit Results and Change History for scorekeepers, Admin for the admin.
struct MoreView: View {
    @Environment(AppState.self) private var app
    @State private var showingSignIn = false

    var body: some View {
        List {
            Section {
                if let account = app.account {
                    HStack(spacing: 12) {
                        AthleteAvatar(name: account.displayName, photo: nil)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(account.displayName).displayStyle(18)
                            Text(account.username.map { "@\($0) · \(account.role.rawValue.capitalized)" } ?? account.role.rawValue.capitalized)
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                    Button("Sign out", role: .destructive) { Task { await app.signOut() } }
                } else {
                    Button {
                        showingSignIn = true
                    } label: {
                        Label("Sign in", systemImage: "person.crop.circle.badge.checkmark")
                    }
                }
            }
            .listRowBackground(Theme.surface.opacity(0.45))

            if let account = app.account {
                if account.isMember {
                    Section("Athletes") {
                        comingSoon("Progress", "chart.xyaxis.line")
                        if app.flags?.showVlog == true { comingSoon("Vlog", "video") }
                        comingSoon("Vote", "hand.raised")
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
                if account.canScore {
                    Section {
                        comingSoon("Submit Results", "square.and.pencil")
                        comingSoon("Change History", "clock.arrow.circlepath")
                    } header: {
                        Text("Scorekeeping")
                    } footer: {
                        if app.flags?.openSubmission == false { Text("The scoreboard is currently locked.") }
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
                Section("Account") {
                    comingSoon("Profile", "person.text.rectangle")
                    if account.isAdmin { comingSoon("Admin", "gearshape.2") }
                }
                .listRowBackground(Theme.surface.opacity(0.45))
            }

            Section {
                Link(destination: APIClient.shared.baseURL) {
                    Label("Open the website", systemImage: "safari")
                }
            }
            .listRowBackground(Theme.surface.opacity(0.45))
        }
        .screenBackground()
        .navigationTitle("More")
        .sheet(isPresented: $showingSignIn) {
            NavigationStack { SignInView() }.presentationDetents([.large])
        }
        .refreshable { await app.refreshMe() }
    }

    /// Screens from later phases of the port: shown so the shape of the app is visible,
    /// but greyed out until they're built.
    private func comingSoon(_ title: String, _ icon: String) -> some View {
        HStack {
            Label(title, systemImage: icon)
            Spacer()
            Text("Soon").font(.caption).foregroundStyle(Theme.muted)
        }
        .foregroundStyle(Theme.muted)
    }
}
