import SwiftUI

/// What if? Type a mark for each event to see its points, the total, and where that
/// would place today. Nothing is saved; the scoring runs on the phone.
struct CalculatorView: View {
    @State private var loader = Loader<LeaderboardResponse>(API.leaderboard)

    var body: some View {
        LoadingView(loader: loader) { board in
            CalculatorForm(board: board)
        }
        .screenBackground()
        .navigationTitle("Calculator")
        .task { await loader.load() }
    }
}

private struct CalculatorForm: View {
    let board: LeaderboardResponse
    @State private var marks: [String: String] = [:]
    @State private var startingAthleteId = ""

    private var points: [String: Int] {
        var result: [String: Int] = [:]
        for event in board.events {
            if let raw = Self.parse(marks[event.id]) { result[event.id] = Scoring.score(raw, event.scoring) }
        }
        return result
    }

    private var total: Int { points.values.reduce(0, +) }

    var body: some View {
        let others = board.entries.filter { $0.athleteId != startingAthleteId }.map(\.totalPoints)
        let projected = Calculator.projectedRank(total: total, others: others)

        List {
            Section {
                Picker("Start from", selection: $startingAthleteId) {
                    Text("Blank").tag("")
                    ForEach(board.entries.sorted { $0.athleteName < $1.athleteName }) { entry in
                        Text(entry.athleteName).tag(entry.athleteId)
                    }
                }
                .onChange(of: startingAthleteId) { prefill() }
            } footer: {
                Text("Picking an athlete fills in their results so far. Change any of them to see what it would take.")
            }
            .listRowBackground(Theme.surface.opacity(0.45))

            Section {
                HStack(spacing: 8) {
                    StatTile(label: "Total", value: total.formatted(), emphasis: true)
                    StatTile(label: "Would place", value: Calculator.ordinal(projected.rank), hint: "of \(projected.of)")
                }
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))

            Section("Events") {
                ForEach(board.events) { event in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.name)
                            Text("100 = \(event.format(event.benchmarkStandard))").font(.caption).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        TextField(event.unitLabel.isEmpty ? "Mark" : event.unitLabel, text: binding(for: event.id))
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                            .frame(width: 80)
                        Text(points[event.id].map { "\($0)" } ?? "—")
                            .font(.display(17)).monospacedDigit()
                            .foregroundStyle(Theme.accent)
                            .frame(width: 44, alignment: .trailing)
                    }
                }
            }
            .listRowBackground(Theme.surface.opacity(0.45))

            Section {
                Button("Clear", role: .destructive) {
                    marks = [:]
                    startingAthleteId = ""
                }
                .disabled(marks.isEmpty && startingAthleteId.isEmpty)
            }
            .listRowBackground(Theme.surface.opacity(0.45))
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func binding(for eventId: String) -> Binding<String> {
        Binding(get: { marks[eventId] ?? "" }, set: { marks[eventId] = $0.isEmpty ? nil : $0 })
    }

    private func prefill() {
        guard let entry = board.entries.first(where: { $0.athleteId == startingAthleteId }) else { return }
        var next: [String: String] = [:]
        for event in board.events {
            if let row = entry.byEventId[event.id] {
                next[event.id] = Scoring.formatMeasurement(row.rawValue, decimals: event.decimals)
            }
        }
        marks = next
    }

    /// Accepts "5.2" and, for locales that use one, "5,2".
    static func parse(_ text: String?) -> Double? {
        guard let text = text?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return nil }
        return Double(text.replacingOccurrences(of: ",", with: "."))
    }
}
