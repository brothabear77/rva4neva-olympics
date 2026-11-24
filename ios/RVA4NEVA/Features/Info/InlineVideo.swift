import AVKit
import SwiftUI

/// A video from public/ that plays in place. The player is made once per URL, not per redraw.
struct InlineVideo: View {
    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        VideoPlayer(player: player)
            .task(id: url) { player = AVPlayer(url: url) }
            .onDisappear { player?.pause() }
    }
}
