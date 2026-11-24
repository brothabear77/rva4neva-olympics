import SwiftUI

/// Every event by day, with who leads it.
struct EventsView: View {
    @Environment(AppState.self) private var app
    @State private var loader = Loader<EventsResponse>(API.events)

    var body: some View {
        LoadingView(loader: loader) { response in
            let days = Dictionary(grouping: response.events, by: \.day).sorted { $0.key < $1.key }
            List {
                ForEach(days, id: \.key) { day, events in
                    Section(dayLabel(day)) {
                        ForEach(events) { event in
                            NavigationLink {
                                EventDetailView(slug: event.slug, title: event.name)
                            } label: {
                                EventRow(event: event)
                            }
                        }
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
            }
        }
        .screenBackground()
        .navigationTitle("Events")
        .task { await loader.load() }
        .refreshable { await loader.load() }
    }

    private func dayLabel(_ day: Int) -> String {
        app.config?.site.days.first { $0.day == day }?.label ?? "Day \(day)"
    }
}

private struct EventRow: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(event.name).displayStyle(17).foregroundStyle(Theme.paper)
                Spacer()
                Text(event.dayTag).font(.geist(.caption).monospacedDigit()).foregroundStyle(Theme.muted)
            }
            if let leader = event.leaderName, let points = event.leaderPoints {
                HStack(spacing: 4) {
                    Image(systemName: "crown.fill").font(.geist(.caption2)).foregroundStyle(Theme.accent)
                    Text(leader).font(.geist(.caption, weight: .semibold))
                    if let raw = event.leaderRaw { Text("· \(event.format(raw))").font(.geist(.caption)).foregroundStyle(Theme.muted) }
                    Text("· \(points) pts").font(.geist(.caption)).foregroundStyle(Theme.muted)
                }
            } else {
                Text(event.description).font(.geist(.caption)).foregroundStyle(Theme.muted).lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

/// One event: how it's scored, its rules and demo, and every result best first.
struct EventDetailView: View {
    let slug: String
    let title: String
    @State private var loader: Loader<EventDetailResponse>

    init(slug: String, title: String) {
        self.slug = slug
        self.title = title
        _loader = State(initialValue: Loader { try await API.event(slug) })
    }

    var body: some View {
        LoadingView(loader: loader) { detail in
            List {
                if let guide = detail.guide {
                    GuideSections(guide: guide)
                }
                Section("Results") {
                    if detail.results.isEmpty {
                        Text("No results yet.").foregroundStyle(Theme.muted)
                    }
                    ForEach(Array(detail.results.enumerated()), id: \.element.id) { index, row in
                        HStack(spacing: 12) {
                            Text("\(index + 1)").font(.number(15))
                                .foregroundStyle(index == 0 ? Theme.accent : Theme.muted).frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.athleteName).font(.geist(.subheadline, weight: .semibold))
                                Text(row.formattedRaw).font(.geist(.caption).monospacedDigit()).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            PointsLabel(points: row.points)
                        }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.45))
            }
        }
        .screenBackground()
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loader.load() }
        .refreshable { await loader.load() }
        .polling(every: .seconds(15)) { await loader.load() }
    }
}
