import Charts
import SwiftUI

/// Your practice attempts at each event, charted as the points they'd score at the games.
/// Private: an athlete sees only their own; the admin picks whose to read.
struct PracticeLogView: View {
    /// Set for the admin reading someone's log; nil for your own.
    let athleteId: String?
    var athleteName: String? = nil

    @State private var loader: Loader<PracticeResponse>
    @State private var adding = false
    @State private var feedback: Feedback?

    init(athleteId: String? = nil, athleteName: String? = nil) {
        self.athleteId = athleteId
        self.athleteName = athleteName
        _loader = State(initialValue: Loader { try await API.practice(athleteId: athleteId) })
    }

    var body: some View {
        LoadingView(loader: loader) { log in
            PracticeContent(log: log, canEdit: athleteId == nil, onDelete: delete)
        }
        .screenBackground()
        .navigationTitle(athleteName ?? "Progress")
        .toolbar {
            if athleteId == nil {
                ToolbarItem(placement: .primaryAction) {
                    Button { adding = true } label: { Label("Log attempt", systemImage: "plus") }
                        .disabled(loader.value == nil)
                }
            }
        }
        .sheet(isPresented: $adding) {
            if let log = loader.value {
                NavigationStack {
                    LogAttemptForm(events: log.events, today: log.today) {
                        adding = false
                        feedback = .success($0)
                        Task { await loader.load() }
                    }
                }
            }
        }
        .feedbackAlert($feedback)
        .task { await loader.load() }
        .refreshable { await loader.load() }
    }

    private func delete(_ attempt: PracticeAttempt) {
        Task {
            do {
                try await API.write("DELETE", "practice/\(attempt.id)")
                await loader.load()
            } catch {
                feedback = .failure(error)
            }
        }
    }
}

private struct PracticeContent: View {
    let log: PracticeResponse
    let canEdit: Bool
    let onDelete: (PracticeAttempt) -> Void

    @State private var chartedEventIds: Set<String> = []

    private var byEvent: [String: [PracticeAttempt]] { Dictionary(grouping: log.attempts, by: \.eventId) }
    private var loggedEvents: [Event] { log.events.filter { byEvent[$0.id] != nil } }

    var body: some View {
        List {
            if log.attempts.isEmpty {
                ContentUnavailableView("No attempts yet", systemImage: "chart.xyaxis.line",
                                       description: Text(canEdit ? "Log a practice attempt with + and watch your points climb." : "Nothing logged."))
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    PracticeChart(events: loggedEvents.filter { chartedEventIds.contains($0.id) }, byEvent: byEvent)
                        .frame(height: 220)
                        .padding(.vertical, 8)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(loggedEvents) { event in
                                let on = chartedEventIds.contains(event.id)
                                Button(event.name) {
                                    if on { chartedEventIds.remove(event.id) } else { chartedEventIds.insert(event.id) }
                                }
                                .font(.geist(.caption, weight: .semibold))
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .background(on ? Theme.accent : Theme.ink, in: Capsule())
                                .foregroundStyle(on ? Theme.ink : Theme.paper)
                                .buttonStyle(.plain)
                            }
                        }
                    }
                } footer: {
                    Text("Each attempt is scored as it would be at the games. Tap an event to show or hide it.")
                }
                .listRowBackground(Theme.surface.opacity(0.45))

                ForEach(loggedEvents) { event in
                    let attempts = byEvent[event.id] ?? []
                    Section {
                        ForEach(attempts) { attempt in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(event.format(attempt.rawValue)).monospacedDigit()
                                    Text(attempt.date.formatted(date: .abbreviated, time: .omitted) + (attempt.notes.isEmpty ? "" : " · \(attempt.notes)"))
                                        .font(.geist(.caption)).foregroundStyle(Theme.muted).lineLimit(1)
                                }
                                Spacer()
                                PointsLabel(points: Scoring.score(attempt.rawValue, event.scoring))
                            }
                            .swipeActions {
                                if canEdit {
                                    Button("Delete", role: .destructive) { onDelete(attempt) }
                                }
                            }
                        }
                    } header: {
                        HStack {
                            Text(event.name)
                            Spacer()
                            if let best = Self.best(attempts, event) {
                                Text("Best \(event.format(best.rawValue)) · \(Scoring.score(best.rawValue, event.scoring)) pts")
                            }
                        }
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
            }
        }
        .onAppear {
            // Open on the three events logged most, as the site does.
            if chartedEventIds.isEmpty {
                chartedEventIds = Set(loggedEvents.sorted { (byEvent[$0.id]?.count ?? 0) > (byEvent[$1.id]?.count ?? 0) }.prefix(3).map(\.id))
            }
        }
    }

    /// The best attempt: smallest for a timed event, largest otherwise (src/lib/practice.ts).
    static func best(_ attempts: [PracticeAttempt], _ event: Event) -> PracticeAttempt? {
        let lower = Scoring.isLowerBetter(event.scoring)
        return attempts.max { lower ? $0.rawValue > $1.rawValue : $0.rawValue < $1.rawValue }
    }
}

private struct PracticeChart: View {
    let events: [Event]
    let byEvent: [String: [PracticeAttempt]]

    var body: some View {
        Chart {
            ForEach(events) { event in
                ForEach((byEvent[event.id] ?? []).sorted { $0.attemptedOn < $1.attemptedOn }) { attempt in
                    LineMark(x: .value("Date", attempt.date, unit: .day),
                             y: .value("Points", Scoring.score(attempt.rawValue, event.scoring)))
                        .foregroundStyle(by: .value("Event", event.name))
                    PointMark(x: .value("Date", attempt.date, unit: .day),
                              y: .value("Points", Scoring.score(attempt.rawValue, event.scoring)))
                        .foregroundStyle(by: .value("Event", event.name))
                }
            }
        }
        .chartYAxisLabel("Points")
        .chartLegend(position: .bottom)
        .overlay { if events.isEmpty { Text("Pick an event below").font(.geist(.caption)).foregroundStyle(Theme.muted) } }
    }
}

private struct LogAttemptForm: View {
    let events: [Event]
    let today: String
    let onSaved: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var eventId = ""
    @State private var value = ""
    @State private var date = Date()
    @State private var notes = ""
    @State private var error: String?
    @State private var saving = false

    private var event: Event? { events.first { $0.id == eventId } }
    private var parsed: Double? { Double(value.replacingOccurrences(of: ",", with: ".")) }
    /// The games' "today" (Eastern), as noon UTC like the stored dates.
    private var latest: Date { (try? Date("\(today)T12:00:00Z", strategy: .iso8601)) ?? Date() }

    var body: some View {
        Form {
            Section {
                Picker("Event", selection: $eventId) {
                    Text("Choose…").tag("")
                    ForEach(events) { Text($0.name).tag($0.id) }
                }
                HStack {
                    TextField("Result", text: $value).keyboardType(.decimalPad).monospacedDigit()
                    if let event, !event.unitLabel.isEmpty { Text(event.unitLabel).foregroundStyle(Theme.muted) }
                }
                DatePicker("Date", selection: $date, in: ...latest, displayedComponents: .date)
                TextField("Notes (optional)", text: $notes, axis: .vertical).lineLimit(1...4)
            } footer: {
                if let error { Text(error).foregroundStyle(.red) }
                else if let event, let parsed { Text("Worth \(Scoring.score(parsed, event.scoring)) points at the games.") }
            }
            .listRowBackground(Theme.surface.opacity(0.45))
        }
        .screenBackground()
        .navigationTitle("Log attempt")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save", action: save).disabled(saving || event == nil || parsed == nil || notes.count > 300)
            }
        }
    }

    private func save() {
        guard let parsed else { return }
        struct Body: Encodable, Sendable { let eventId: String; let value: Double; let attemptedOn: String; let notes: String }
        // The calendar day as picked, without a time zone shifting it.
        // (An ISO formatter would use UTC, turning 11pm Eastern into tomorrow.)
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        let day = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
        saving = true
        Task {
            defer { saving = false }
            do {
                onSaved(try await API.write("POST", "practice", Body(eventId: eventId, value: parsed, attemptedOn: day, notes: notes)))
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
