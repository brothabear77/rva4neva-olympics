import SwiftUI

/// A rank in a circle: gold for 1st, silver-ish for 2nd and 3rd, plain after that.
struct RankBadge: View {
    let rank: Int

    var body: some View {
        Text("\(rank)")
            .font(.display(15))
            .monospacedDigit()
            .frame(width: 30, height: 30)
            .foregroundStyle(rank == 1 ? Theme.ink : Theme.paper)
            .background(Circle().fill(fill))
            .overlay(Circle().strokeBorder(rank <= 3 ? Theme.accent.opacity(0.6) : Theme.edge))
            .accessibilityLabel("Rank \(rank)")
    }

    private var fill: Color {
        switch rank {
        case 1: Theme.accent
        case 2, 3: Theme.surface
        default: Theme.ink
        }
    }
}

/// A labelled number, like the leaderboard's "Leader / Margin / Events completed".
struct StatTile: View {
    let label: String
    let value: String
    var hint: String? = nil
    var emphasis = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).eyebrowStyle().foregroundStyle(Theme.muted)
            Text(value)
                .displayStyle(24)
                .foregroundStyle(emphasis ? Theme.accent : Theme.paper)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if let hint { Text(hint).font(.caption).foregroundStyle(Theme.muted).lineLimit(1) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(padding: 12)
    }
}

/// An athlete's photo, or their initials when there isn't one.
struct AthleteAvatar: View {
    let name: String
    let photo: String?
    var size: CGFloat = 44

    var body: some View {
        Group {
            if let url = APIClient.shared.assetURL(photo) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        initialsView
                    }
                }
            } else {
                initialsView
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Theme.edge))
        .accessibilityHidden(true)
    }

    private var initialsView: some View {
        Text(Self.initials(name))
            .font(.display(size * 0.4))
            .foregroundStyle(Theme.accent)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.surface)
    }

    /// "Nick" -> "N", "Dana Scully" -> "DS" (src/lib/profiles.ts initials()).
    static func initials(_ name: String) -> String {
        let words = name.split(whereSeparator: \.isWhitespace)
        return words.prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }
}

/// "92 pts" in the accent colour, with tabular digits so columns line up.
struct PointsLabel: View {
    let points: Int
    var size: CGFloat = 17

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(points.formatted()).font(.display(size)).foregroundStyle(Theme.accent).monospacedDigit()
            Text("pts").font(.caption).foregroundStyle(Theme.muted)
        }
    }
}

/// A walkout song row that opens in Spotify.
struct WalkoutRow: View {
    let song: WalkoutSong

    var body: some View {
        if let url = song.spotifyURL {
            Link(destination: url) {
                HStack(spacing: 12) {
                    AsyncImage(url: song.albumArtUrl.flatMap(URL.init(string:))) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Image(systemName: "music.note").foregroundStyle(Theme.muted)
                    }
                    .frame(width: 44, height: 44)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(song.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.paper).lineLimit(1)
                        Text(song.artists).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "arrow.up.right.square").foregroundStyle(Theme.accent)
                }
            }
            .accessibilityLabel("Walkout song: \(song.title) by \(song.artists). Opens Spotify.")
        }
    }
}
