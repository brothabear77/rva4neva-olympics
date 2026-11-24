import SwiftUI

/// Overall standings, refreshed every 10 seconds like the site's.
struct LeaderboardView: View {
    @State private var loader = Loader<LeaderboardResponse>(API.leaderboard)

    var body: some View {
        LoadingView(loader: loader) { board in
            LeaderboardContent(board: board)
        }
        .screenBackground()
        .navigationTitle("Leaderboard")
        .task { await loader.load() }
        .refreshable { await loader.load() }
        .polling(every: .seconds(10)) { await loader.load() }
    }
}

private struct LeaderboardContent: View {
    let board: LeaderboardResponse

    private var scored: [LeaderboardEntry] { board.entries.filter { $0.eventsCompleted > 0 } }

    var body: some View {
        List {
            if scored.isEmpty {
                ContentUnavailableView("No scores yet", systemImage: "trophy",
                                       description: Text("The board fills in as results come in."))
                    .listRowBackground(Color.clear)
            } else {
                Section { stats }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))

                Section {
                    ForEach(board.entries) { entry in
                        NavigationLink {
                            AthleteScoresView(entry: entry, events: board.events)
                        } label: {
                            EntryRow(entry: entry, eventCount: board.events.count)
                        }
                    }
                } footer: {
                    Text("Tap an athlete to see their score in every event.")
                }
                .listRowBackground(Theme.surface.opacity(0.45))

                if !board.ties.isEmpty {
                    Section {
                        ForEach(board.ties, id: \.self) { TieGroupView(group: $0) }
                    } header: {
                        Text("Tiebreakers")
                    } footer: {
                        Text("Level totals are split by each athlete's best single event, then their second best, and so on. The outlined score broke the tie.")
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }

                let superlatives = board.superlatives.filter { !$0.leaders.isEmpty }
                if !superlatives.isEmpty {
                    Section("Superlatives") {
                        ForEach(superlatives, id: \.category.slug) { result in
                            HStack {
                                Text(result.category.label).font(.geist(.subheadline, weight: .semibold))
                                Spacer()
                                Text(result.leaders.map(\.athleteName).formatted())
                                    .foregroundStyle(Theme.accent)
                                Text("\(result.leaders[0].score)").monospacedDigit().foregroundStyle(Theme.muted)
                            }
                        }
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
            }
        }
    }

    @ViewBuilder private var stats: some View {
        let leader = scored.first
        let runnerUp = scored.dropFirst().first
        let margin = (leader?.totalPoints ?? 0) - (runnerUp?.totalPoints ?? 0)
        let onTiebreak = leader != nil && runnerUp != nil && margin == 0 && leader!.rank < runnerUp!.rank
        // An event is complete once every athlete on the roster has a result in it.
        let completed = board.events.filter { event in board.entries.allSatisfy { $0.byEventId[event.id] != nil } }.count

        HStack(spacing: 8) {
            StatTile(label: "Leader", value: leader?.athleteName ?? "—",
                     hint: leader.map { "\($0.totalPoints.formatted()) pts" }, emphasis: true)
            StatTile(label: "Margin",
                     value: margin > 0 ? "+\(margin.formatted())" : onTiebreak ? "Tiebreak" : "Tied",
                     hint: runnerUp.map { "over \($0.athleteName)" } ?? "at the top")
            StatTile(label: "Done", value: "\(completed)", hint: "of \(board.events.count)")
        }
    }
}

private struct EntryRow: View {
    let entry: LeaderboardEntry
    let eventCount: Int

    var body: some View {
        HStack(spacing: 12) {
            RankBadge(rank: entry.rank)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(entry.athleteName).displayStyle(17).foregroundStyle(Theme.paper)
                    if entry.wonOnTiebreak {
                        Image(systemName: "scalemass").font(.geist(.caption2)).foregroundStyle(Theme.accent)
                            .accessibilityLabel("Placed on tiebreak")
                    }
                }
                Text("\(entry.eventsCompleted) of \(eventCount) events").font(.geist(.caption)).foregroundStyle(Theme.muted)
            }
            Spacer()
            PointsLabel(points: entry.totalPoints, size: 20)
        }
        .padding(.vertical, 2)
    }
}

/// One athlete's score in every event, in schedule order.
struct AthleteScoresView: View {
    let entry: LeaderboardEntry
    let events: [Event]

    var body: some View {
        List {
            Section {
                HStack {
                    RankBadge(rank: entry.rank)
                    Text(entry.athleteName).displayStyle(22)
                    Spacer()
                    PointsLabel(points: entry.totalPoints, size: 24)
                }
            }
            .listRowBackground(Color.clear)

            Section("By event") {
                ForEach(events) { event in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.name)
                            Text(event.dayTag).font(.geist(.caption)).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        if let row = entry.byEventId[event.id] {
                            VStack(alignment: .trailing, spacing: 2) {
                                PointsLabel(points: row.points)
                                Text(row.formattedRaw).font(.geist(.caption).monospacedDigit()).foregroundStyle(Theme.muted)
                            }
                        } else {
                            Text("—").foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            .listRowBackground(Theme.surface.opacity(0.45))
        }
        .screenBackground()
        .navigationTitle(entry.athleteName)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Athletes level on total points, and the scores that split them, mirroring the site's
/// Tiebreakers (src/components/Tiebreakers.tsx): each comparison in turn ("Best event",
/// "2nd best"…), with every athlete's event and points there, down to the score that broke
/// the tie, which is outlined. An athlete already placed drops out of the later rows.
private struct TieGroupView: View {
    let group: TieGroup

    /// How many score positions to show: for two athletes, down to the deciding one (or all
    /// of them if nothing decided it); for more, as deep as it took to order everyone.
    private var rowCount: Int {
        if group.athletes.count == 2, let decided = group.decidedAt.first ?? nil { return decided + 1 }
        if group.athletes.count == 2 { return max(group.athletes[0].scores.count, 1) }
        return max(group.depth, 1)
    }

    private var unresolved: Bool { group.athletes.contains { $0.settledAt == nil } }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(Calculator.ordinal(group.athletes.first?.rank ?? 0)).font(.number(18)).foregroundStyle(Theme.accent)
                Text("place").font(.geist(.subheadline)).foregroundStyle(Theme.muted)
                Spacer()
                Text("Level on \(group.totalPoints) pts").font(.geist(.caption)).foregroundStyle(Theme.muted)
            }
            Text(group.athletes.map(\.athleteName).formatted(.list(type: .and)))
                .displayStyle(17)
                .foregroundStyle(Theme.paper)

            ForEach(0..<rowCount, id: \.self) { k in
                VStack(alignment: .leading, spacing: 6) {
                    Text(k == 0 ? "Best event" : "\(Calculator.ordinal(k + 1)) best")
                        .eyebrowStyle()
                        .foregroundStyle(Theme.muted)
                    ForEach(group.athletes.filter { inPlay($0, at: k) }) { athlete in
                        ScoreLine(athlete: athlete, score: athlete.scores[safe: k], deciding: athlete.highlightAt == k)
                    }
                }
            }

            if unresolved {
                Text("Every score matches, so a new tiebreaker is needed.")
                    .font(.geist(.caption, weight: .bold))
                    .foregroundStyle(Theme.accent)
            }
        }
        .padding(.vertical, 6)
    }

    /// Still being compared at position k: not yet placed by an earlier score.
    private func inPlay(_ athlete: TieGroup.Athlete, at k: Int) -> Bool {
        guard let settled = athlete.settledAt else { return true }
        return k <= settled
    }
}

private struct ScoreLine: View {
    let athlete: TieGroup.Athlete
    let score: TieGroup.Score?
    let deciding: Bool

    var body: some View {
        HStack(spacing: 10) {
            Text("\(athlete.rank)").font(.number(13)).foregroundStyle(Theme.muted).frame(width: 20, alignment: .leading)
            Text(athlete.athleteName).font(.geist(.subheadline, weight: .semibold)).foregroundStyle(Theme.paper)
            Spacer(minLength: 8)
            Text(score?.eventName ?? "no result")
                .font(.geist(.caption))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .truncationMode(.tail)
            Text("\(score?.points ?? 0)")
                .font(.number(15))
                .foregroundStyle(deciding ? Theme.accent : Theme.paper)
                .padding(.horizontal, 8).padding(.vertical, 2)
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(deciding ? Theme.accent : .clear))
                .frame(minWidth: 44, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(athlete.athleteName): \(score.map { "\($0.points) points in \($0.eventName)" } ?? "no result")\(deciding ? ", broke the tie" : "")")
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
