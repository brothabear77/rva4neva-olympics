import Testing
@testable import RVA4NEVA

// The confetti must match the site's PIECES (src/components/Confetti.tsx) and keyframes.
@Suite("Confetti")
struct ConfettiTests {
    @Test func piecesMatchTheSite() {
        let pieces = ConfettiView.pieces
        #expect(pieces.count == 28)
        // i = 0: left 0, size 10, round, gold, duration 4, delay -0
        #expect(pieces[0].left == 0 && pieces[0].size == 10 && pieces[0].round && pieces[0].gold && pieces[0].duration == 4 && pieces[0].offset == 0)
        // i = 1: left 37, size 7, rectangle, paper, duration 4 + 7 % 5 = 6, delay -(2.6 % 6)
        #expect(pieces[1].left == 37 && pieces[1].size == 7 && !pieces[1].round && !pieces[1].gold && pieces[1].duration == 6)
        #expect(abs(pieces[1].offset - 2.6) < 1e-9)
        // i = 5: left 85, size 5 (5 % 3 == 2), duration 4 + 35 % 5 = 4, delay -(13 % 4) = -1
        #expect(pieces[5].left == 85 && pieces[5].size == 5 && pieces[5].duration == 4 && abs(pieces[5].offset - 1) < 1e-9)
        #expect(pieces.allSatisfy { (4...8).contains($0.duration) && $0.offset >= 0 && $0.offset < $0.duration })
    }

    @Test func fadesLikeTheKeyframes() {
        #expect(ConfettiView.opacity(at: 0) == 0)
        #expect(abs(ConfettiView.opacity(at: 0.04) - 0.5) < 1e-9)
        #expect(ConfettiView.opacity(at: 0.5) == 1)
        #expect(abs(ConfettiView.opacity(at: 0.96) - 0.5) < 1e-9)
        #expect(ConfettiView.opacity(at: 1) == 0)
    }

    @Test func progressLoops() {
        let piece = ConfettiView.pieces[0]  // 4 s, no offset
        #expect(ConfettiView.progress(of: piece, at: 1) == 0.25)
        #expect(ConfettiView.progress(of: piece, at: 5) == 0.25)
        #expect(ConfettiView.progress(of: piece, at: -1) == 0.75)
    }
}
