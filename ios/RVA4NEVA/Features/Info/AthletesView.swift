import SwiftUI

/// Everyone in the games, alphabetically, and where they stand.
struct AthletesView: View {
    @State private var loader = Loader<AthletesResponse>(API.athletes)

    var body: some View {
        LoadingView(loader: loader) { response in
            List(response.athletes) { athlete in
                NavigationLink {
                    AthleteDetailView(athlete: athlete, eventCount: response.eventCount)
                } label: {
                    HStack(spacing: 12) {
                        AthleteAvatar(name: athlete.name, photo: athlete.photo)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(athlete.name).displayStyle(17).foregroundStyle(Theme.paper)
                            if let tagline = athlete.tagline {
                                Text(tagline).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                            }
                        }
                        Spacer()
                        if athlete.eventsCompleted > 0 { RankBadge(rank: athlete.rank) }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.45))
            }
            .overlay {
                if response.athletes.isEmpty {
                    ContentUnavailableView("Nobody on the roster yet", systemImage: "person.3",
                                           description: Text("Athletes appear here as soon as they sign up."))
                }
            }
        }
        .screenBackground()
        .navigationTitle("Athletes")
        .task { await loader.load() }
        .refreshable { await loader.load() }
    }
}

struct AthleteDetailView: View {
    let athlete: AthleteSummary
    let eventCount: Int
    @Environment(AppState.self) private var app

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                AthleteAvatar(name: athlete.name, photo: athlete.photo, size: 140)
                Text(athlete.name).displayStyle(30).foregroundStyle(Theme.paper)
                if let tagline = athlete.tagline {
                    Text(tagline).font(.subheadline.italic()).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                }

                HStack(spacing: 8) {
                    StatTile(label: "Rank", value: athlete.eventsCompleted > 0 ? Calculator.ordinal(athlete.rank) : "—", emphasis: true)
                    StatTile(label: "Points", value: athlete.totalPoints.formatted())
                    StatTile(label: "Events", value: "\(athlete.eventsCompleted)/\(eventCount)")
                }

                if let best = athlete.best {
                    HStack {
                        Text("Best event").eyebrowStyle()
                        Spacer()
                        Text("\(best.eventName) · \(best.formattedRaw)").font(.subheadline)
                        PointsLabel(points: best.points)
                    }
                    .card(padding: 12)
                }

                if let walkout = athlete.walkout {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Walkout song").eyebrowStyle()
                        WalkoutRow(song: walkout)
                    }
                    .card(padding: 12)
                }

                if let bio = athlete.bio {
                    // A blank line starts a new paragraph, as on the site.
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(bio.components(separatedBy: "\n\n").filter { !$0.isEmpty }, id: \.self) {
                            Text($0.trimmingCharacters(in: .whitespacesAndNewlines))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card()
                }
            }
            .padding()
        }
        .screenBackground()
        .navigationTitle(athlete.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Your own profile is under More; the admin edits anyone's from here.
            if app.account?.isAdmin == true || app.account?.athleteId == athlete.id {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink("Edit") {
                        ProfileEditorView(athleteId: athlete.id, isOwnAccount: app.account?.athleteId == athlete.id)
                    }
                }
            }
        }
    }
}
