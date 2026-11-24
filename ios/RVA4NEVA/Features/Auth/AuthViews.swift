import SwiftUI

struct SignInView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var username = ""
    @State private var password = ""
    @State private var error: String?
    @State private var working = false
    @FocusState private var focus: Field?

    private enum Field { case username, password }

    var body: some View {
        Form {
            Section {
                TextField("Username", text: $username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .username)
                    .submitLabel(.next)
                    .onSubmit { focus = .password }
                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .focused($focus, equals: .password)
                    .submitLabel(.go)
                    .onSubmit(submit)
            } footer: {
                if let error { Text(error).foregroundStyle(.red) }
            }
            .listRowBackground(Theme.surface.opacity(0.45))

            Section {
                Button(action: submit) {
                    HStack { Spacer(); if working { ProgressView() } else { Text("Sign in").bold() }; Spacer() }
                }
                .disabled(working || username.isEmpty || password.isEmpty)
            }
            .listRowBackground(Theme.accent.opacity(0.2))

            if app.me?.registrationLocked == false {
                Section {
                    NavigationLink("New here? Sign up as an athlete") { RegisterView(onDone: { dismiss() }) }
                }
                .listRowBackground(Theme.surface.opacity(0.45))
            }
        }
        .screenBackground()
        .navigationTitle("Sign in")
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        .onAppear { focus = .username }
    }

    private func submit() {
        guard !working, !username.isEmpty, !password.isEmpty else { return }
        working = true
        error = nil
        Task {
            defer { working = false }
            do {
                try await app.signIn(username: username, password: password)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

struct RegisterView: View {
    let onDone: () -> Void
    @Environment(AppState.self) private var app
    @State private var name = ""
    @State private var username = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var error: String?
    @State private var working = false

    var body: some View {
        Form {
            Section {
                TextField("Your name, as it appears on the leaderboard", text: $name)
                    .textContentType(.givenName)
                TextField("Username", text: $username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Password", text: $password).textContentType(.newPassword)
                SecureField("Confirm password", text: $confirm).textContentType(.newPassword)
            } footer: {
                if let error { Text(error).foregroundStyle(.red) }
                else { Text("You join the roster straight away, in every event and every vote.") }
            }
            .listRowBackground(Theme.surface.opacity(0.45))

            Section {
                Button {
                    submit()
                } label: {
                    HStack { Spacer(); if working { ProgressView() } else { Text("Sign up").bold() }; Spacer() }
                }
                .disabled(working || name.isEmpty || username.isEmpty || password.isEmpty || confirm.isEmpty)
            }
            .listRowBackground(Theme.accent.opacity(0.2))
        }
        .screenBackground()
        .navigationTitle("Sign up")
    }

    private func submit() {
        working = true
        error = nil
        Task {
            defer { working = false }
            do {
                _ = try await app.register(name: name, username: username, password: password, confirm: confirm)
                onDone()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
