import SwiftUI

/// Before kickoff: the logo, the countdown and the quotes. After: the champion (once
/// every score is in), the podium, the latest results and the schedule.
struct HomeView: View {
    @Environment(AppState.self) private var app
    @State private var loader = Loader<HomeResponse>(API.home)

    var body: some View {
        ScrollView {
            LoadingView(loader: loader) { home in
                if home.started {
                    LiveHome(home: home, tagline: app.config?.site.tagline, quotes: app.config?.quotes ?? [])
                } else {
                    PreKickoff(startsAt: home.startsAt, quotes: app.config?.quotes ?? [])
                }
            }
            .padding()
        }
        .screenBackground()
        .navigationTitle(app.config?.site.shortName ?? "#rva4neva")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loader.load() }
        .refreshable { await loader.load() }
        .polling(every: .seconds(15)) { await loader.load() }
    }
}

private struct PreKickoff: View {
    let startsAt: Date
    let quotes: [Quote]

    var body: some View {
        VStack(spacing: 32) {
            Image("Logo").resizable().scaledToFit().frame(maxWidth: 220)
                .accessibilityLabel("#rva4neva Olympics")
            CountdownView(startsAt: startsAt, large: true)
            QuoteCarousel(quotes: quotes)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 24)
    }
}

private struct LiveHome: View {
    let home: HomeResponse
    let tagline: String?
    let quotes: [Quote]

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(spacing: 16) {
                if let tagline { Text(tagline).eyebrowStyle() }
                Image("Logo").resizable().scaledToFit().frame(width: 96)
                CountdownView(startsAt: home.startsAt, finished: home.finished)
                if home.champions.isEmpty {
                    QuoteCarousel(quotes: quotes)
                } else {
                    ForEach(home.champions) { ChampionCard(champion: $0) }
                }
            }
            .frame(maxWidth: .infinity)
            .card(padding: 20)

            section("Podium") {
                if home.podium.isEmpty {
                    Text("No results yet. The podium fills in as scores come in.")
                        .font(.geist(.subheadline)).foregroundStyle(Theme.muted).card()
                } else {
                    VStack(spacing: 8) {
                        ForEach(home.podium) { entry in
                            HStack(spacing: 12) {
                                RankBadge(rank: entry.rank)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.athleteName).displayStyle(18).foregroundStyle(Theme.paper)
                                    if let best = entry.best {
                                        Text("Best: \(best.eventName) (\(best.points) pts)")
                                            .font(.geist(.caption)).foregroundStyle(Theme.muted)
                                    }
                                }
                                Spacer()
                                PointsLabel(points: entry.totalPoints, size: 20)
                            }
                            .card(padding: 12)
                        }
                    }
                }
            }

            section("Latest results") {
                if home.recent.isEmpty {
                    Text("Nothing recorded yet.").font(.geist(.subheadline)).foregroundStyle(Theme.muted).card()
                } else {
                    VStack(spacing: 0) {
                        ForEach(home.recent) { row in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(row.athleteName).font(.geist(.subheadline, weight: .semibold))
                                    Text("\(row.eventName) · \(row.formattedRaw)").font(.geist(.caption)).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                PointsLabel(points: row.points)
                            }
                            .padding(.vertical, 8)
                            if row.id != home.recent.last?.id { Divider().overlay(Theme.edge) }
                        }
                    }
                    .card(padding: 12)
                }
            }

            section("The schedule") {
                VStack(spacing: 8) {
                    ForEach(home.events) { event in
                        NavigationLink {
                            EventDetailView(slug: event.slug, title: event.name)
                        } label: {
                            HStack {
                                Text(event.name).foregroundStyle(Theme.paper)
                                Spacer()
                                Text("Day \(event.day).\(event.sortOrder)").font(.geist(.caption).monospacedDigit()).foregroundStyle(Theme.muted)
                                Image(systemName: "chevron.right").font(.geist(.caption)).foregroundStyle(Theme.muted)
                            }
                            .card(padding: 12)
                        }
                    }
                }
            }
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).displayStyle(20).foregroundStyle(Theme.paper)
            content()
        }
    }
}

private struct ChampionCard: View {
    let champion: Champion

    var body: some View {
        VStack(spacing: 10) {
            Text("Champion").eyebrowStyle()
            AthleteAvatar(name: champion.athleteName, photo: champion.photo, size: 96)
                .overlay(Circle().strokeBorder(Theme.accent, lineWidth: 3))
            Text(champion.athleteName).displayStyle(28).foregroundStyle(Theme.paper)
            PointsLabel(points: champion.totalPoints, size: 22)
            if let walkout = champion.walkout { WalkoutRow(song: walkout).card(padding: 10) }
        }
        .frame(maxWidth: .infinity)
    }
}
