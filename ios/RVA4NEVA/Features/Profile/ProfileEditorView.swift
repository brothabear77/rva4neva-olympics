import SwiftUI

/// Your profile: name, tagline, bio and walkout song, then your sign-in details. The
/// admin opens it for any athlete from the roster (then only the athlete parts show).
struct ProfileEditorView: View {
    /// The athlete being edited; nil for a staff login, which has only sign-in details.
    let athleteId: String?
    /// Whether this is the signed-in account's own profile (shows username and password).
    let isOwnAccount: Bool

    @Environment(AppState.self) private var app
    @State private var loader: Loader<ProfileView>?

    init(athleteId: String?, isOwnAccount: Bool) {
        self.athleteId = athleteId
        self.isOwnAccount = isOwnAccount
        _loader = State(initialValue: athleteId.map { id in Loader { try await API.profile(id) } })
    }

    var body: some View {
        Group {
            if let loader {
                LoadingView(loader: loader) { profile in
                    Form {
                        AthleteFields(profile: profile) { await loader.load() }
                        if isOwnAccount { AccountFields() }
                    }
                }
                .task { await loader.load() }
            } else {
                Form { AccountFields() }
            }
        }
        .screenBackground()
        .navigationTitle(isOwnAccount ? "Profile" : "Edit profile")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct AthleteFields: View {
    let profile: ProfileView
    let reload: @MainActor () async -> Void

    @Environment(AppState.self) private var app
    @State private var name: String
    @State private var tagline: String
    @State private var bio: String
    @State private var saving = false
    @State private var feedback: Feedback?
    @State private var searching = false

    private static let maxTagline = 160  // src/lib/profiles.ts MAX_TAGLINE_LENGTH
    private static let maxBio = 2000     // MAX_BIO_LENGTH

    init(profile: ProfileView, reload: @escaping @MainActor () async -> Void) {
        self.profile = profile
        self.reload = reload
        _name = State(initialValue: profile.name)
        _tagline = State(initialValue: profile.tagline)
        _bio = State(initialValue: profile.bio)
    }

    private var dirty: Bool { name != profile.name || tagline != profile.tagline || bio != profile.bio }

    var body: some View {
        Section {
            HStack {
                Spacer()
                AthleteAvatar(name: profile.name, photo: profile.photo, size: 88)
                Spacer()
            }
            .listRowBackground(Color.clear)
        }

        Section {
            TextField("Name", text: $name).textContentType(.name)
            TextField("Tagline", text: $tagline, axis: .vertical).lineLimit(1...3)
            TextField("Bio", text: $bio, axis: .vertical).lineLimit(4...12)
        } header: {
            Text("About you")
        } footer: {
            Text("The tagline sits under your name on the roster. In the bio, a blank line starts a new paragraph. \(tagline.count)/\(Self.maxTagline) · \(bio.count)/\(Self.maxBio)")
        }
        .listRowBackground(Theme.surface.opacity(0.45))

        Section {
            Button(action: save) {
                HStack { Spacer(); if saving { ProgressView() } else { Text("Save").bold() }; Spacer() }
            }
            .disabled(!dirty || saving || tagline.count > Self.maxTagline || bio.count > Self.maxBio)
        }
        .listRowBackground(Theme.accent.opacity(0.2))

        Section("Walkout song") {
            if let walkout = profile.walkout {
                WalkoutRow(song: walkout)
                Button("Change song") { searching = true }
                Button("Remove song", role: .destructive) {
                    Task { await run { try await API.write("DELETE", "athletes/\(profile.athleteId)/walkout") } }
                }
            } else {
                Button { searching = true } label: { Label("Pick a walkout song", systemImage: "music.note.list") }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.45))
        .sheet(isPresented: $searching) {
            NavigationStack {
                WalkoutSearchView { song in
                    searching = false
                    struct Body: Encodable, Sendable { let kind: String; let spotifyId: String }
                    Task { await run { try await API.write("PUT", "athletes/\(profile.athleteId)/walkout", Body(kind: song.kind, spotifyId: song.spotifyId)) } }
                }
            }
        }
        .feedbackAlert($feedback)
    }

    private func save() {
        saving = true
        Task {
            defer { saving = false }
            do {
                var messages: [String] = []
                if name.trimmingCharacters(in: .whitespaces) != profile.name {
                    messages.append(try await API.write("PATCH", "athletes/\(profile.athleteId)", ["name": name]))
                }
                if tagline != profile.tagline || bio != profile.bio {
                    messages.append(try await API.write("PATCH", "athletes/\(profile.athleteId)/profile", ["tagline": tagline, "bio": bio]))
                }
                feedback = .success(messages.joined(separator: " "))
                await reload()
                await app.refreshMe()  // a rename changes your display name
            } catch {
                feedback = .failure(error)
            }
        }
    }

    private func run(_ op: @escaping @Sendable () async throws -> String) async {
        do {
            feedback = .success(try await op())
            await reload()
        } catch {
            feedback = .failure(error)
        }
    }
}

/// Username and password: only ever your own.
private struct AccountFields: View {
    @Environment(AppState.self) private var app
    @State private var username = ""
    @State private var current = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var feedback: Feedback?
    @State private var working = false

    var body: some View {
        Section {
            TextField("Username", text: $username)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Change username") {
                perform {
                    let message = try await API.write("PATCH", "me/username", ["username": username])
                    await app.refreshMe()
                    return message
                }
            }
            .disabled(working || username.isEmpty || username == app.account?.username)
        } header: {
            Text("Sign-in")
        }
        .listRowBackground(Theme.surface.opacity(0.45))
        .onAppear { if username.isEmpty { username = app.account?.username ?? "" } }

        Section {
            SecureField("Current password", text: $current).textContentType(.password)
            SecureField("New password", text: $password).textContentType(.newPassword)
            SecureField("Confirm new password", text: $confirm).textContentType(.newPassword)
            Button("Change password") {
                perform {
                    let message = try await API.write("PATCH", "me/password", ["current": current, "password": password, "confirm": confirm])
                    current = ""; password = ""; confirm = ""
                    return message
                }
            }
            .disabled(working || current.isEmpty || password.isEmpty || confirm.isEmpty)
        } footer: {
            Text("Changing your password signs out every other device and browser, but not this app.")
        }
        .listRowBackground(Theme.surface.opacity(0.45))
        .feedbackAlert($feedback)
    }

    private func perform(_ op: @escaping @MainActor () async throws -> String) {
        working = true
        Task {
            defer { working = false }
            do { feedback = .success(try await op()) } catch { feedback = .failure(error) }
        }
    }
}
