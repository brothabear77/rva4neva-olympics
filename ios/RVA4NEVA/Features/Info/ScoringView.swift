import Charts
import SwiftUI

/// How scoring works: the two-benchmark line, drawn for each event.
struct ScoringView: View {
    @State private var loader = Loader<LeaderboardResponse>(API.leaderboard)

    var body: some View {
        LoadingView(loader: loader) { board in
            List {
                Section {
                    Text("Each event has two benchmarks: the performance worth 100 points, and the one worth 0. Every mark in between scores along a straight line between them.")
                    Text("Beat the 100-point benchmark and you earn more than 100. Fall short of the 0-point benchmark and you score 0, never less.")
                    Text("Your total is the sum of your points across every event. Equal totals are split by best single event, then second best, and so on.")
                }
                .font(.subheadline)
                .listRowBackground(Theme.surface.opacity(0.45))

                ForEach(board.events.filter { Scoring.isScorable($0.scoring) }) { event in
                    Section {
                        ScaleChart(event: event)
                            .frame(height: 140)
                            .padding(.vertical, 6)
                    } header: {
                        Text(event.name)
                    } footer: {
                        Text("100 pts = \(event.format(event.benchmarkStandard)) · 0 pts = \(event.format(event.benchmarkZero))")
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
            }
        }
        .screenBackground()
        .navigationTitle("Scoring")
        .task { await loader.load() }
    }
}

/// Points against the raw mark, from a little worse than the zero benchmark to a little
/// better than the top one. A sprint's line slopes down: lower is better.
private struct ScaleChart: View {
    let event: Event

    private var samples: [(raw: Double, points: Int)] {
        let config = event.scoring
        guard let low = Scoring.rawForPoints(-15, config), let high = Scoring.rawForPoints(115, config) else { return [] }
        let lo = min(low, high), hi = max(low, high)
        return stride(from: 0, through: 60, by: 1).map { step in
            let raw = lo + (hi - lo) * Double(step) / 60
            return (raw, Scoring.score(raw, config))
        }
    }

    var body: some View {
        Chart {
            ForEach(samples, id: \.raw) { sample in
                LineMark(x: .value(event.unitLabel.isEmpty ? "Mark" : event.unitLabel, sample.raw),
                         y: .value("Points", sample.points))
                    .foregroundStyle(Theme.accent)
            }
            RuleMark(y: .value("100", 100)).foregroundStyle(Theme.muted.opacity(0.4)).lineStyle(StrokeStyle(dash: [4, 4]))
        }
        .chartYScale(domain: 0...120)
        .chartYAxis { AxisMarks(values: [0, 50, 100]) }
        .accessibilityLabel("\(event.name) scale: \(event.format(event.benchmarkStandard)) is 100 points, \(event.format(event.benchmarkZero)) is 0.")
    }
}
