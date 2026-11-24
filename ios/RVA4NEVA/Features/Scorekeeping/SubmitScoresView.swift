import SwiftUI
import UniformTypeIdentifiers

/// Scorekeepers and the admin: enter marks one event at a time, or import a CSV.
/// Drafts are kept per athlete and event, so marks for several events go in one save.
struct SubmitScoresView: View {
    @State private var loader = Loader<GridResponse>(API.grid)
    @State private var mode = Mode.enter
    @State private var importing = false

    enum Mode: String, CaseIterable { case enter = "Enter", remove = "Remove", csv = "CSV" }

    var body: some View {
        LoadingView(loader: loader) { grid in
            VStack(spacing: 0) {
                if grid.locked {
                    Label("The scoreboard is currently locked.", systemImage: "lock.fill")
                        .font(.geist(.subheadline, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(10)
                        .background(Color.red.opacity(0.25))
                }
                Picker("Mode", selection: $mode) {
                    ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) }
                }
                .pickerStyle(.segmented)
                .padding()

                switch mode {
                case .enter: EnterScores(grid: grid) { await loader.load() }
                case .remove: RemoveScores(grid: grid) { await loader.load() }
                case .csv: CSVImport(locked: grid.locked) { await loader.load() }
                }
            }
        }
        .screenBackground()
        .navigationTitle("Submit Results")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loader.load() }
    }
}

/// The event chips shared by Enter and Remove.
private struct EventChips: View {
    let events: [Event]
    @Binding var selected: String
    var badge: (Event) -> Int = { _ in 0 }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(events) { event in
                    let on = selected == event.id
                    Button {
                        selected = event.id
                    } label: {
                        HStack(spacing: 4) {
                            Text(event.name)
                            let n = badge(event)
                            if n > 0 { Text("\(n)").font(.geist(.caption2, weight: .bold)).padding(.horizontal, 5).background(Theme.accent, in: Capsule()).foregroundStyle(Theme.ink) }
                        }
                        .font(.geist(.caption, weight: .semibold))
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        .background(on ? Theme.paper : Theme.surface, in: Capsule())
                        .foregroundStyle(on ? Theme.ink : Theme.paper)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
        }
        .padding(.bottom, 8)
    }
}

private struct EnterScores: View {
    let grid: GridResponse
    let reload: @MainActor () async -> Void

    @State private var eventId = ""
    @State private var edits: [String: String] = [:]
    @State private var saving = false
    @State private var feedback: Feedback?
    @FocusState private var focused: String?

    private var original: [String: Double] {
        Dictionary(grid.values.map { (Grid.key(athleteId: $0.athleteId, eventId: $0.eventId), $0.rawValue) }, uniquingKeysWith: { a, _ in a })
    }
    private var diff: Grid.Diff {
        Grid.collectChanges(athletes: grid.athletes.map { ($0.id, $0.name) }, eventIds: grid.events.map(\.id),
                            original: original, edits: edits)
    }
    private var event: Event? { grid.events.first { $0.id == eventId } ?? grid.events.first }

    var body: some View {
        let diff = diff
        VStack(spacing: 0) {
            EventChips(events: grid.events, selected: Binding(get: { event?.id ?? "" }, set: { eventId = $0 })) { ev in
                diff.changes.filter { $0.eventId == ev.id }.count
            }
            if let event {
                List {
                    Section {
                        ForEach(grid.athletes) { athlete in
                            row(athlete: athlete, event: event, invalid: diff.invalidKeys.contains(Grid.key(athleteId: athlete.id, eventId: event.id)))
                        }
                    } header: {
                        Text("\(event.name) · \(Scoring.isLowerBetter(event.scoring) ? "lower is better" : "higher is better")")
                    } footer: {
                        Text("Stored marks show in gray. Type over one to replace it. Leaving a box blank never removes a score; use Remove for that.")
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
                .scrollDismissesKeyboard(.interactively)
            }

            saveBar(diff)
        }
        .feedbackAlert($feedback)
    }

    private func row(athlete: GridResponse.Athlete, event: Event, invalid: Bool) -> some View {
        let key = Grid.key(athleteId: athlete.id, eventId: event.id)
        let stored = original[key]
        let typed = edits[key] ?? ""
        let points: Int? = {
            if case .number(let v) = Grid.parseCell(typed) { return Scoring.score(v, event.scoring) }
            return stored.map { Scoring.score($0, event.scoring) }
        }()
        return HStack {
            Text(athlete.name)
            Spacer()
            TextField(stored.map { Scoring.formatMeasurement($0, decimals: event.decimals) } ?? "—",
                      text: Binding(get: { edits[key] ?? "" }, set: { edits[key] = $0 }))
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .frame(width: 90)
                .focused($focused, equals: key)
                .foregroundStyle(invalid ? .red : Theme.paper)
                .disabled(grid.locked)
            Text(event.unitLabel).font(.geist(.caption)).foregroundStyle(Theme.muted).frame(width: 24, alignment: .leading)
            Text(points.map(String.init) ?? "")
                .font(.number(16))
                .foregroundStyle(typed.isEmpty ? Theme.muted : Theme.accent)
                .frame(width: 40, alignment: .trailing)
        }
    }

    private func saveBar(_ diff: Grid.Diff) -> some View {
        HStack {
            if !diff.invalidKeys.isEmpty {
                Text("\(diff.invalidKeys.count) box\(diff.invalidKeys.count == 1 ? "" : "es") aren't numbers").font(.geist(.caption)).foregroundStyle(.red)
            } else {
                Text(diff.changes.isEmpty ? "No changes" : "\(diff.changes.count) to save").font(.geist(.subheadline)).foregroundStyle(Theme.muted)
            }
            Spacer()
            if !edits.isEmpty { Button("Discard") { edits = [:] }.disabled(saving) }
            Button {
                save(diff.changes)
            } label: {
                if saving { ProgressView() } else { Text("Save").bold() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(diff.changes.isEmpty || !diff.invalidKeys.isEmpty || saving || grid.locked)
        }
        .padding()
        .background(.bar)
    }

    private func save(_ changes: [Grid.Change]) {
        struct Body: Encodable, Sendable { let changes: [Grid.Change] }
        focused = nil
        saving = true
        Task {
            defer { saving = false }
            do {
                feedback = .success(try await API.write("POST", "scores", Body(changes: changes)))
                edits = [:]
                await reload()
            } catch {
                feedback = .failure(error)
            }
        }
    }
}

private struct RemoveScores: View {
    let grid: GridResponse
    let reload: @MainActor () async -> Void

    @State private var eventId = ""
    @State private var selected: Set<String> = []
    @State private var confirming = false
    @State private var working = false
    @State private var feedback: Feedback?

    private var event: Event? { grid.events.first { $0.id == eventId } ?? grid.events.first }
    private var names: [String: String] { Dictionary(uniqueKeysWithValues: grid.athletes.map { ($0.id, $0.name) }) }

    var body: some View {
        VStack(spacing: 0) {
            EventChips(events: grid.events, selected: Binding(get: { event?.id ?? "" }, set: { eventId = $0 })) { ev in
                selected.filter { $0.hasSuffix("|\(ev.id)") }.count
            }
            if let event {
                let stored = grid.values.filter { $0.eventId == event.id }.sorted { (names[$0.athleteId] ?? "") < (names[$1.athleteId] ?? "") }
                List {
                    Section {
                        if stored.isEmpty { Text("No scores in this event.").foregroundStyle(Theme.muted) }
                        ForEach(stored, id: \.athleteId) { value in
                            let key = Grid.key(athleteId: value.athleteId, eventId: event.id)
                            Button {
                                if selected.contains(key) { selected.remove(key) } else { selected.insert(key) }
                            } label: {
                                HStack {
                                    Image(systemName: selected.contains(key) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selected.contains(key) ? .red : Theme.muted)
                                    Text(names[value.athleteId] ?? "?").foregroundStyle(Theme.paper)
                                    Spacer()
                                    Text(event.format(value.rawValue)).monospacedDigit().foregroundStyle(Theme.muted)
                                }
                            }
                            .disabled(grid.locked)
                        }
                    } footer: {
                        Text("Removed scores stay in Change History and can be restored from there.")
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
            }
            HStack {
                Text(selected.isEmpty ? "Select scores to remove" : "\(selected.count) selected").foregroundStyle(Theme.muted)
                Spacer()
                Button("Remove", role: .destructive) { confirming = true }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .disabled(selected.isEmpty || working || grid.locked)
            }
            .padding()
            .background(.bar)
        }
        .confirmationDialog("Remove \(selected.count) score\(selected.count == 1 ? "" : "s")?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Remove", role: .destructive, action: remove)
        }
        .feedbackAlert($feedback)
    }

    private func remove() {
        struct Cell: Encodable, Sendable { let athleteId: String; let athleteName: String; let eventId: String }
        struct Body: Encodable, Sendable { let cells: [Cell] }
        let cells = selected.compactMap { key -> Cell? in
            let parts = key.split(separator: "|").map(String.init)
            guard parts.count == 2 else { return nil }
            return Cell(athleteId: parts[0], athleteName: names[parts[0]] ?? "", eventId: parts[1])
        }
        working = true
        Task {
            defer { working = false }
            do {
                feedback = .success(try await API.write("POST", "scores/delete", Body(cells: cells)))
                selected = []
                await reload()
            } catch {
                feedback = .failure(error)
            }
        }
    }
}

/// Pick a CSV (eventSlug, athleteName, rawValue, notes), review what each row would do, then apply.
private struct CSVImport: View {
    let locked: Bool
    let reload: @MainActor () async -> Void

    @State private var picking = false
    @State private var csv: (name: String, text: String)?
    @State private var preview: ImportPreview?
    @State private var working = false
    @State private var feedback: Feedback?

    var body: some View {
        List {
            Section {
                Button { picking = true } label: {
                    Label(csv == nil ? "Choose a CSV file" : "Choose a different file", systemImage: "doc.badge.plus")
                }
                if let csv { Text(csv.name).font(.geist(.caption)).foregroundStyle(Theme.muted) }
            } footer: {
                Text("Columns: eventSlug, athleteName, rawValue, and optionally notes. Any bad row blocks the whole import, so the board is never half-updated.")
            }
            .listRowBackground(Theme.surface.opacity(0.45))

            if let preview {
                Section("Preview") {
                    HStack {
                        ForEach(["create", "update", "unchanged", "error"], id: \.self) { kind in
                            VStack {
                                Text("\(preview.counts[kind] ?? 0)").font(.number(20))
                                    .foregroundStyle(kind == "error" && (preview.counts[kind] ?? 0) > 0 ? .red : Theme.paper)
                                Text(kind.capitalized).font(.geist(.caption2)).foregroundStyle(Theme.muted)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    ForEach(preview.fileErrors + preview.missingColumns.map { "Missing column: \($0)" }, id: \.self) {
                        Text($0).foregroundStyle(.red)
                    }
                    ForEach(preview.rows.filter { $0.action != .unchanged }) { row in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text("Line \(row.line)").font(.geist(.caption).monospacedDigit()).foregroundStyle(Theme.muted)
                                Text("\(row.athleteName) · \(row.eventName ?? row.eventSlug)")
                                Spacer()
                                Text(row.action.rawValue.capitalized).font(.geist(.caption, weight: .bold))
                                    .foregroundStyle(row.action == .error ? .red : Theme.accent)
                            }
                            if let error = row.error {
                                Text(error).font(.geist(.caption)).foregroundStyle(.red)
                            } else if let raw = row.rawValue {
                                let decimals = row.decimals ?? 2
                                let before = row.previousRawValue.map { Scoring.formatMeasurement($0, decimals: decimals) + " → " } ?? ""
                                Text("\(before)\(Scoring.formatMeasurement(raw, decimals: decimals)) \(row.unitLabel ?? "") · \(row.points ?? 0) pts")
                                    .font(.geist(.caption).monospacedDigit()).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.45))

                Section {
                    Button(action: commit) {
                        HStack { Spacer(); if working { ProgressView() } else { Text("Apply import").bold() }; Spacer() }
                    }
                    .disabled(!preview.canCommit || working || locked)
                }
                .listRowBackground(Theme.accent.opacity(0.2))
            }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.commaSeparatedText, .plainText]) { result in
            load(result)
        }
        .feedbackAlert($feedback)
    }

    private func load(_ result: Result<URL, Error>) {
        do {
            let url = try result.get()
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let text = try String(contentsOf: url, encoding: .utf8)
            csv = (url.lastPathComponent, text)
            preview = nil
            working = true
            Task {
                defer { working = false }
                do { preview = try await API.previewImport(csv: text) } catch { feedback = .failure(error) }
            }
        } catch {
            feedback = .failure(error)
        }
    }

    private func commit() {
        guard let csv else { return }
        working = true
        Task {
            defer { working = false }
            do {
                feedback = .success(try await API.write("POST", "imports", ["csv": csv.text, "filename": csv.name]))
                self.csv = nil
                preview = nil
                await reload()
            } catch {
                feedback = .failure(error)
            }
        }
    }
}
