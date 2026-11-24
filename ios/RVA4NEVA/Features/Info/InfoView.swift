import SwiftUI

/// The site's Info menu: the roster, the event guide, how scoring works, and the calculator.
struct InfoView: View {
    var body: some View {
        List {
            Section {
                NavigationLink { AthletesView() } label: {
                    Label("Athletes", systemImage: "person.3")
                }
                NavigationLink { EventGuideView() } label: {
                    Label("Event Guide", systemImage: "book")
                }
                NavigationLink { ScoringView() } label: {
                    Label("Scoring", systemImage: "chart.line.uptrend.xyaxis")
                }
                NavigationLink { CalculatorView() } label: {
                    Label("Calculator", systemImage: "plusminus")
                }
            }
            .listRowBackground(Theme.surface.opacity(0.45))
        }
        .screenBackground()
        .navigationTitle("Info")
    }
}

/// An event's summary, demo, scale and rules. Shared by Event Guide and the event page.
struct GuideSections: View {
    let guide: GuideEvent

    var body: some View {
        Section {
            Text(guide.summary).foregroundStyle(Theme.paper)
            if let media = guide.media { MediaView(media: media) }
        }
        .listRowBackground(Theme.surface.opacity(0.45))

        if let scale = guide.scale {
            Section {
                ForEach(scale.ladder, id: \.self) { step in
                    HStack {
                        Text(step.mark).monospacedDigit()
                        Spacer()
                        PointsLabel(points: step.points)
                    }
                }
            } header: {
                Text("Scoring")
            } footer: {
                Text("\(scale.top) earns 100 points and \(scale.zero) earns 0. Beat the top mark and you earn more than 100.")
            }
            .listRowBackground(Theme.surface.opacity(0.45))
        }

        if !guide.rules.isEmpty {
            Section("Rules") {
                ForEach(guide.rules, id: \.self) { rule in
                    Label(rule, systemImage: "checkmark.circle").labelStyle(RuleLabelStyle())
                }
            }
            .listRowBackground(Theme.surface.opacity(0.45))
        }
    }
}

private struct RuleLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            configuration.icon.foregroundStyle(Theme.accent).font(.caption)
            configuration.title
        }
    }
}

/// A demo: a photo or GIF inline, a video in the player, a YouTube clip as a tappable poster.
struct MediaView: View {
    let media: GuideMedia

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            switch media.kind {
            case "youtube":
                if let url = media.youtubeURL {
                    Link(destination: url) {
                        ZStack {
                            poster
                            Image(systemName: "play.circle.fill").font(.system(size: 52)).foregroundStyle(.white, .black.opacity(0.5))
                        }
                    }
                    .accessibilityLabel("\(media.label). Plays on YouTube.")
                }
            case "video":
                if let url = APIClient.shared.assetURL(media.src) {
                    InlineVideo(url: url).aspectRatio(16 / 9, contentMode: .fit)
                }
            default:
                // image or gif (AsyncImage shows a GIF's first frame).
                AsyncImage(url: APIClient.shared.assetURL(media.src)) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    Theme.surface.aspectRatio(16 / 9, contentMode: .fit)
                }
                .accessibilityLabel(media.label)
            }
            if let caption = media.caption { Text(caption).font(.caption).foregroundStyle(Theme.muted) }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var poster: some View {
        AsyncImage(url: APIClient.shared.assetURL(media.poster)) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Theme.ink
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipped()
    }
}

/// The Event Guide: every event, opening to its rules, demo and scale.
struct EventGuideView: View {
    @State private var loader = Loader<GuideResponse>(API.guide)

    var body: some View {
        LoadingView(loader: loader) { response in
            List(response.events) { guide in
                NavigationLink {
                    List { GuideSections(guide: guide) }
                        .screenBackground()
                        .navigationTitle(guide.name)
                        .navigationBarTitleDisplayMode(.inline)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(guide.name).displayStyle(17)
                        Text(guide.summary).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.45))
            }
        }
        .screenBackground()
        .navigationTitle("Event Guide")
        .task { await loader.load() }
    }
}
