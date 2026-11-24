import Foundation

/// The two benchmarks that define an event's straight-line points scale.
struct ScoringConfig: Sendable, Hashable {
    /// The performance worth 100 points.
    let benchmarkStandard: Double
    /// The performance worth 0 points.
    let benchmarkZero: Double
}

/// Decathlon-style scoring, ported from src/lib/scoring.ts. Keep the two in step:
/// RVA4NEVATests/ScoringTests runs the same cases as src/lib/__tests__/scoring.test.ts.
///
/// points = round(100 × (raw − zero) / (standard − zero)), floored at 0 and NOT capped
/// at 100 (beating the top benchmark is worth something), except a hard ceiling of
/// 10,000 so a typo can't swamp the standings. Direction falls out of the math: for
/// a sprint the standard is below the zero, so the slope is negative.
enum Scoring {
    static let maxPoints = 10_000

    static func isLowerBetter(_ config: ScoringConfig) -> Bool {
        config.benchmarkStandard < config.benchmarkZero
    }

    /// Equal benchmarks mean no scale: every mark would be both 0 and 100.
    static func isScorable(_ config: ScoringConfig) -> Bool {
        config.benchmarkStandard.isFinite && config.benchmarkZero.isFinite
            && config.benchmarkStandard != config.benchmarkZero
    }

    static func score(_ raw: Double, _ config: ScoringConfig) -> Int {
        guard raw.isFinite, isScorable(config) else { return 0 }
        let span = config.benchmarkStandard - config.benchmarkZero
        let points = 100 * (raw - config.benchmarkZero) / span
        guard points.isFinite else { return 0 }
        // Clamp while still a Double: Int(1e300) would trap.
        return Int(min(Double(maxPoints), max(0, jsRound(points))))
    }

    /// The raw mark worth `points`: the inverse of `score`.
    static func rawForPoints(_ points: Double, _ config: ScoringConfig) -> Double? {
        guard isScorable(config) else { return nil }
        let span = config.benchmarkStandard - config.benchmarkZero
        return config.benchmarkZero + points * span / 100
    }

    /// A measurement at an event's precision: 5.126 at 2 decimals -> "5.13".
    static func formatMeasurement(_ value: Double, decimals: Int) -> String {
        guard value.isFinite else { return "—" }
        let places = max(0, min(6, decimals))
        return String(format: "%.\(places)f", value)
    }

    /// JavaScript's Math.round: halves go up (toward +∞), so -2.5 -> -2. Swift's default
    /// .rounded() goes away from zero (-2.5 -> -3); the server's numbers use this one.
    static func jsRound(_ x: Double) -> Double {
        (x + 0.5).rounded(.down)
    }
}

/// The Calculator's "where would that place today", ported from src/lib/calculator.ts.
enum Calculator {
    /// Points only: equal totals share a rank (no per-event tiebreak for a hypothetical).
    static func projectedRank(total: Int, others: [Int]) -> (rank: Int, of: Int) {
        (others.filter { $0 > total }.count + 1, others.count + 1)
    }

    /// 1 -> "1st", 11 -> "11th", 23 -> "23rd".
    static func ordinal(_ n: Int) -> String {
        let lastTwo = n % 100
        if (11...13).contains(lastTwo) { return "\(n)th" }
        switch n % 10 {
        case 1: return "\(n)st"
        case 2: return "\(n)nd"
        case 3: return "\(n)rd"
        default: return "\(n)th"
        }
    }
}
