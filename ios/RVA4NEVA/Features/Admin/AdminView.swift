import SwiftUI

/// The admin: registration, who can enter scores, deleting athletes, and how events are scored.
struct AdminView: View {
    @State private var loader = Loader<AdminResponse>(API.admin)
    @State private var feedback: Feedback?
    @State private var deleting: AdminAccount?
    @State private var editingEvent: Event?

    var body: some View {
        LoadingView(loader: loader) { admin in
            List {
                Section {
                    Toggle("Registration locked", isOn: Binding(
                        get: { admin.registrationLocked },
                        set: { locked in run { try await API.write("PUT", "settings/registration-locked", ["locked": locked]) } }
                    ))
                } footer: {
                    Text("While locked, nobody new can sign up.")
                }
                .listRowBackground(Theme.surface.opacity(0.45))

                Section("Accounts") {
                    ForEach(admin.accounts) { account in
                        AccountRow(account: account,
                                   setScorekeeper: { on in run { try await API.write("PUT", "accounts/\(account.id)/scorekeeper", ["on": on]) } },
                                   delete: { deleting = account })
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.45))

                Section {
                    ForEach(admin.events) { event in
                        Button { editingEvent = event } label: {
                            HStack {
                                Text(event.name).foregroundStyle(Theme.paper)
                                Spacer()
                                Text("100 = \(event.format(event.benchmarkStandard)) · 0 = \(event.format(event.benchmarkZero))")
                                    .font(.geist(.caption).monospacedDigit()).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                } header: {
                    Text("Scoring")
                } footer: {
                    Text("Changing an event's benchmarks re-scores every result in it at once. It's recorded in Change History.")
                }
                .listRowBackground(Theme.surface.opacity(0.45))
            }
        }
        .screenBackground()
        .navigationTitle("Admin")
        .task { await loader.load() }
        .refreshable { await loader.load() }
        .sheet(item: $deleting) { account in
            NavigationStack {
                DeleteAthleteSheet(account: account) {
                    deleting = nil
                    run { try await API.write("DELETE", "athletes/\(account.athleteId ?? "")") }
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(item: $editingEvent) { event in
            NavigationStack {
                BenchmarkEditor(event: event) { message in
                    editingEvent = nil
                    feedback = .success(message)
                    Task { await loader.load() }
                }
            }
        }
        .feedbackAlert($feedback)
    }

    private func run(_ op: @escaping @Sendable () async throws -> String) {
        Task {
            do { feedback = .success(try await op()) } catch { feedback = .failure(error) }
            await loader.load()
        }
    }
}

private struct AccountRow: View {
    let account: AdminAccount
    let setScorekeeper: @MainActor @Sendable (Bool) -> Void
    let delete: @MainActor @Sendable () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(account.name).font(.geist(.subheadline, weight: .semibold))
                    Text("@\(account.username) · \(account.isStaff ? "staff" : account.role.rawValue)")
                        .font(.geist(.caption)).foregroundStyle(Theme.muted)
                }
                Spacer()
                if let athleteId = account.athleteId {
                    NavigationLink("Edit") { ProfileEditorView(athleteId: athleteId, isOwnAccount: false) }
                        .font(.geist(.caption)).fixedSize()
                }
            }
            // Staff logins are managed with `npm run auth:staff`, not here.
            if account.athleteId != nil {
                Toggle("Can enter scores", isOn: Binding(get: { account.role == .scorekeeper }, set: setScorekeeper))
                    .font(.geist(.caption))
            }
        }
        .swipeActions {
            if account.athleteId != nil {
                Button("Delete", role: .destructive, action: delete)
            }
        }
    }
}

/// Deleting an athlete takes everything with them and can't be undone, so it asks for the name.
private struct DeleteAthleteSheet: View {
    let account: AdminAccount
    let onConfirm: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""

    var body: some View {
        Form {
            Section {
                Text("This deletes \(account.name)'s account, scores, practice log, votes, proposals and videos. Their scores' history entries are kept but can't be restored.")
                TextField("Type \(account.name) to confirm", text: $typed)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }
            .listRowBackground(Theme.surface.opacity(0.45))
            Section {
                Button("Delete \(account.name)", role: .destructive, action: onConfirm)
                    .disabled(typed.trimmingCharacters(in: .whitespaces).lowercased() != account.name.lowercased())
            }
            .listRowBackground(Theme.surface.opacity(0.45))
        }
        .screenBackground()
        .navigationTitle("Delete athlete")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
    }
}

/// An event's two benchmarks and precision, with what a few marks would score as you type.
private struct BenchmarkEditor: View {
    let event: Event
    let onSaved: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var standard: String
    @State private var zero: String
    @State private var decimals: Int
    @State private var error: String?
    @State private var saving = false

    init(event: Event, onSaved: @escaping (String) -> Void) {
        self.event = event
        self.onSaved = onSaved
        _standard = State(initialValue: Scoring.formatMeasurement(event.benchmarkStandard, decimals: event.decimals))
        _zero = State(initialValue: Scoring.formatMeasurement(event.benchmarkZero, decimals: event.decimals))
        _decimals = State(initialValue: event.decimals)
    }

    private var config: ScoringConfig? {
        guard let s = Double(standard), let z = Double(zero) else { return nil }
        return ScoringConfig(benchmarkStandard: s, benchmarkZero: z)
    }

    var body: some View {
        Form {
            Section {
                LabeledContent("100 points at") {
                    TextField("", text: $standard).keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing).monospacedDigit()
                }
                LabeledContent("0 points at") {
                    TextField("", text: $zero).keyboardType(.numbersAndPunctuation).multilineTextAlignment(.trailing).monospacedDigit()
                }
                Stepper("Decimals: \(decimals)", value: $decimals, in: 0...4)
            } footer: {
                if let error { Text(error).foregroundStyle(.red) }
                else if let config, !Scoring.isScorable(config) { Text("The two benchmarks must differ.").foregroundStyle(.red) }
                else if let config { Text(Scoring.isLowerBetter(config) ? "Lower is better (a time)." : "Higher is better.") }
            }
            .listRowBackground(Theme.surface.opacity(0.45))

            if let config, Scoring.isScorable(config) {
                Section("What marks would score") {
                    ForEach([100, 75, 50, 25, 0], id: \.self) { target in
                        if let raw = Scoring.rawForPoints(Double(target), config) {
                            HStack {
                                Text(Scoring.formatMeasurement(raw, decimals: decimals) + (event.unitLabel.isEmpty ? "" : " \(event.unitLabel)"))
                                    .monospacedDigit()
                                Spacer()
                                PointsLabel(points: Scoring.score(raw, config))
                            }
                        }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.45))
            }
        }
        .screenBackground()
        .navigationTitle(event.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save", action: save).disabled(saving || config.map { !Scoring.isScorable($0) } ?? true)
            }
        }
    }

    private func save() {
        guard let config else { return }
        struct Body: Encodable, Sendable { let benchmarkStandard: Double; let benchmarkZero: Double; let decimals: Int }
        saving = true
        Task {
            defer { saving = false }
            do {
                onSaved(try await API.write("PATCH", "events/\(event.id)/benchmarks",
                                            Body(benchmarkStandard: config.benchmarkStandard, benchmarkZero: config.benchmarkZero, decimals: decimals)))
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
