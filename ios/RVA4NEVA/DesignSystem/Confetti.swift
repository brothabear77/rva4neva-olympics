import SwiftUI

/// A looping fall of confetti over whatever it overlays: the home hero once there's a
/// champion. A port of the site's src/components/Confetti.tsx and its `confetti-fall`
/// keyframes (globals.css), so both look the same:
///
/// - 28 fixed pieces, gold and paper (the palette's two lightest colours), not random,
///   matching the site piece for piece.
/// - Each falls linearly from 10% above the box to 10% below it, turning 540°, fading in
///   over the first 8% of its fall and out over the last 8%.
/// - Durations of 4–8 s, and each starts part-way through its fall, so the loop is
///   already going on the first frame rather than everything starting at the top at once.
///
/// Drawn in a Canvas (one view, not 28) and off entirely when Reduce Motion is on, as
/// `motion-reduce:hidden` does on the site. It never takes taps.
struct ConfettiView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    struct Piece: Sendable {
        /// Left edge, as a percentage of the width.
        let left: Double
        let size: Double
        let round: Bool
        let gold: Bool
        let duration: Double
        /// How far into its fall the piece starts, in seconds.
        let offset: Double
    }

    /// The site's PIECES, same formulas.
    nonisolated static let pieces: [Piece] = (0..<28).map { i in
        let duration = Double(4 + (i * 7) % 5)
        return Piece(
            left: Double((i * 37) % 100),
            size: i % 3 == 0 ? 10 : i % 3 == 1 ? 7 : 5,
            round: i % 4 == 0,
            gold: i % 2 == 0,
            duration: duration,
            offset: (Double(i) * 2.6).truncatingRemainder(dividingBy: duration)
        )
    }

    var body: some View {
        if !reduceMotion {
            TimelineView(.animation) { timeline in
                Canvas { context, size in
                    let now = timeline.date.timeIntervalSinceReferenceDate
                    for piece in Self.pieces {
                        draw(piece, at: now, in: &context, size: size)
                    }
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    private func draw(_ piece: Piece, at now: TimeInterval, in context: inout GraphicsContext, size: CGSize) {
        let progress = Self.progress(of: piece, at: now)
        let width = piece.size
        let height = piece.round ? piece.size : piece.size * 1.6
        // The keyframes move the piece's top edge from -10% to 110% of the box's height.
        let top = size.height * (-0.10 + 1.20 * progress)
        let center = CGPoint(x: size.width * piece.left / 100 + width / 2, y: top + height / 2)

        var layer = context
        layer.opacity = Self.opacity(at: progress)
        layer.translateBy(x: center.x, y: center.y)
        layer.rotate(by: .degrees(540 * progress))
        let rect = CGRect(x: -width / 2, y: -height / 2, width: width, height: height)
        let shape = piece.round ? Path(ellipseIn: rect) : Path(roundedRect: rect, cornerRadius: 2)
        layer.fill(shape, with: .color(piece.gold ? Theme.accent : Theme.paper))
    }

    /// 0…1 through the piece's current fall.
    nonisolated static func progress(of piece: Piece, at now: TimeInterval) -> Double {
        let t = (now + piece.offset).truncatingRemainder(dividingBy: piece.duration)
        return (t < 0 ? t + piece.duration : t) / piece.duration
    }

    /// The keyframes' opacity: 0 → 1 over the first 8%, 1 → 0 over the last 8%.
    nonisolated static func opacity(at progress: Double) -> Double {
        if progress < 0.08 { return progress / 0.08 }
        if progress > 0.92 { return (1 - progress) / 0.08 }
        return 1
    }
}
