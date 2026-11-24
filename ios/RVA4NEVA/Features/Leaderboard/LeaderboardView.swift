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
                    Section("Tiebreakers") {
                        ForEach(board.ties, id: \.self) { TieGroupView(group: $0) }
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }

                let superlatives = board.superlatives.filter { !$0.leaders.isEmpty }
                if !superlatives.isEmpty {
                    Section("Superlatives") {
                        ForEach(superlatives, id: \.category.slug) { result in
                            HStack {
                                Text(result.category.label).font(.subheadline.weight(.semibold))
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
                        Image(systemName: "scalemass").font(.caption2).foregroundStyle(Theme.accent)
                            .accessibilityLabel("Placed on tiebreak")
                    }
                }
                Text("\(entry.eventsCompleted) of \(eventCount) events").font(.caption).foregroundStyle(Theme.muted)
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
                            Text(event.dayTag).font(.caption).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        if let row = entry.byEventId[event.id] {
                            VStack(alignment: .trailing, spacing: 2) {
                                PointsLabel(points: row.points)
                                Text(row.formattedRaw).font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
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

/// Athletes level on total points, and the scores (best first) that split them.
private struct TieGroupView: View {
    let group: TieGroup

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Level on \(group.totalPoints) pts").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
            ForEach(group.athletes) { athlete in
                HStack(alignment: .firstTextBaseline) {
                    Text("\(athlete.rank)").monospacedDigit().foregroundStyle(Theme.muted).frame(width: 22, alignment: .leading)
                    Text(athlete.athleteName).font(.subheadline.weight(.semibold))
                    Spacer()
                    HStack(spacing: 4) {
                        ForEach(Array(athlete.scores.prefix(group.depth).enumerated()), id: \.offset) { index, score in
                            Text("\(score.points)")
                                .font(.caption.monospacedDigit())
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(index == athlete.highlightAt ? Theme.accent : Theme.ink,
                                            in: Capsule())
                                .foregroundStyle(index == athlete.highlightAt ? Theme.ink : Theme.paper)
                        }
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}
