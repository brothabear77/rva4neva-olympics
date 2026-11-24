import SwiftUI

/// Search Spotify for a walkout song, or paste an open.spotify.com link.
struct WalkoutSearchView: View {
    let onPick: (WalkoutSong) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [WalkoutSong] = []
    @State private var error: String?
    @State private var searching = false

    var body: some View {
        List {
            if let error {
                Text(error).foregroundStyle(Theme.muted).listRowBackground(Color.clear)
            }
            ForEach(results, id: \.spotifyId) { song in
                Button { onPick(song) } label: {
                    HStack(spacing: 12) {
                        AsyncImage(url: song.albumArtUrl.flatMap(URL.init(string:))) { $0.resizable().scaledToFill() } placeholder: {
                            Image(systemName: "music.note").foregroundStyle(Theme.muted)
                        }
                        .frame(width: 44, height: 44)
                        .background(Theme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(song.title).foregroundStyle(Theme.paper).lineLimit(1)
                            Text(song.artists).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                        }
                        Spacer()
                        if song.kind == "episode" { Image(systemName: "mic").foregroundStyle(Theme.muted) }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.45))
            }
        }
        .overlay { if searching && results.isEmpty { ProgressView() } }
        .screenBackground()
        .navigationTitle("Walkout song")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Song, artist, or Spotify link")
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        // Debounced: a new keystroke cancels the pending search (each one spends Spotify quota).
        .task(id: query) {
            let text = query.trimmingCharacters(in: .whitespaces)
            guard text.count >= 2 else { results = []; error = nil; return }
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            searching = true
            defer { searching = false }
            do {
                results = try await API.searchWalkout(text)
                error = results.isEmpty ? "No songs found." : nil
            } catch {
                if !Task.isCancelled { self.error = error.localizedDescription }
            }
        }
    }
}
