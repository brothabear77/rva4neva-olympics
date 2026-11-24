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
                                .font(.geist(.caption)).foregroundStyle(Theme.muted)
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
                        NavigationLink {
                            if account.athleteId != nil { PracticeLogView() } else { AdminPracticePicker() }
                        } label: {
                            Label("Progress", systemImage: "chart.xyaxis.line")
                        }
                        if app.flags?.showVlog == true {
                            NavigationLink { VlogView() } label: { Label("Vlog", systemImage: "video") }
                        }
                        NavigationLink { VoteView() } label: {
                            Label("Vote", systemImage: "hand.raised")
                        }
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
                if account.canScore {
                    Section {
                        NavigationLink { SubmitScoresView() } label: { Label("Submit Results", systemImage: "square.and.pencil") }
                        NavigationLink { ChangeHistoryView() } label: { Label("Change History", systemImage: "clock.arrow.circlepath") }
                    } header: {
                        Text("Scorekeeping")
                    } footer: {
                        if app.flags?.openSubmission == false { Text("The scoreboard is currently locked.") }
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
                Section("Account") {
                    NavigationLink {
                        ProfileEditorView(athleteId: account.athleteId, isOwnAccount: true)
                    } label: {
                        Label("Profile", systemImage: "person.text.rectangle")
                    }
                    if account.isAdmin {
                        NavigationLink { AdminView() } label: { Label("Admin", systemImage: "gearshape.2") }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.45))
            }

            if app.account?.canScore != true {
                Section {
                    NavigationLink { ChangeHistoryView() } label: { Label("Change History", systemImage: "clock.arrow.circlepath") }
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
}

/// The admin has no practice log of their own: pick whose to read.
private struct AdminPracticePicker: View {
    @State private var loader = Loader<AthletesResponse>(API.athletes)

    var body: some View {
        LoadingView(loader: loader) { response in
            List(response.athletes) { athlete in
                NavigationLink(athlete.name) { PracticeLogView(athleteId: athlete.id, athleteName: athlete.name) }
                    .listRowBackground(Theme.surface.opacity(0.45))
            }
        }
        .screenBackground()
        .navigationTitle("Progress")
        .task { await loader.load() }
    }
}
