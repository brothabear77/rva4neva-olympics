import Testing
@testable import RVA4NEVA

// The same cases as src/lib/__tests__/scoring.test.ts and calculator.test.ts, so the
// phone and the server can't disagree about a score.

private let cornholeDistance = ScoringConfig(benchmarkStandard: 30, benchmarkZero: 0)
private let fortyYardDash = ScoringConfig(benchmarkStandard: 5, benchmarkZero: 9)

@Suite("Scoring — higher is better")
struct HigherIsBetter {
    @Test func benchmarks() {
        #expect(Scoring.score(30, cornholeDistance) == 100)
        #expect(Scoring.score(0, cornholeDistance) == 0)
    }
    @Test func interpolates() {
        #expect(Scoring.score(15, cornholeDistance) == 50)
        #expect(Scoring.score(21, cornholeDistance) == 70)
    }
    @Test func notCappedAt100() { #expect(Scoring.score(36, cornholeDistance) == 120) }
    @Test func flooredAtZero() { #expect(Scoring.score(-10, cornholeDistance) == 0) }
}

@Suite("Scoring — lower is better")
struct LowerIsBetter {
    @Test func benchmarks() {
        #expect(Scoring.score(5, fortyYardDash) == 100)
        #expect(Scoring.score(9, fortyYardDash) == 0)
    }
    @Test func negativeSlope() {
        #expect(Scoring.score(7, fortyYardDash) == 50)
        #expect(Scoring.score(6, fortyYardDash) == 75)
    }
    @Test func beatsFastBenchmark() { #expect(Scoring.score(4.5, fortyYardDash) == 113) }
    @Test func verySlowIsZero() { #expect(Scoring.score(30, fortyYardDash) == 0) }
    @Test func direction() {
        #expect(Scoring.isLowerBetter(fortyYardDash))
        #expect(!Scoring.isLowerBetter(cornholeDistance))
    }
}

@Suite("Scoring — bad input")
struct BadInput {
    @Test func equalBenchmarks() {
        let flat = ScoringConfig(benchmarkStandard: 10, benchmarkZero: 10)
        #expect(!Scoring.isScorable(flat))
        #expect(Scoring.score(5, flat) == 0)
        #expect(Scoring.rawForPoints(50, flat) == nil)
    }
    @Test func nonFinite() {
        #expect(Scoring.score(.nan, cornholeDistance) == 0)
        #expect(Scoring.score(.infinity, cornholeDistance) == 0)
    }
    @Test func ceiling() {
        #expect(Scoring.score(30_000, cornholeDistance) == Scoring.maxPoints)
        #expect(Scoring.score(1e300, cornholeDistance) == Scoring.maxPoints)
    }
}

@Suite("Scoring — helpers")
struct Helpers {
    @Test func rawForPointsInverts() {
        #expect(Scoring.rawForPoints(50, fortyYardDash) == 7)
        #expect(Scoring.rawForPoints(100, cornholeDistance) == 30)
    }
    @Test func formats() {
        #expect(Scoring.formatMeasurement(5.126, decimals: 2) == "5.13")
        #expect(Scoring.formatMeasurement(5, decimals: 0) == "5")
        #expect(Scoring.formatMeasurement(.nan, decimals: 2) == "—")
    }
    /// JavaScript rounds halves up; Swift's default rounds them away from zero.
    @Test func roundsLikeJavaScript() {
        #expect(Scoring.jsRound(2.5) == 3)
        #expect(Scoring.jsRound(-2.5) == -2)
        #expect(Scoring.jsRound(-0.4) == 0)
    }
}

@Suite("Calculator")
struct CalculatorTests {
    @Test func projectedRank() {
        let rank = Calculator.projectedRank(total: 300, others: [500, 300, 200])
        #expect(rank.rank == 2)
        #expect(rank.of == 4)
        #expect(Calculator.projectedRank(total: 0, others: []).rank == 1)
    }
    @Test(arguments: [(1, "1st"), (2, "2nd"), (3, "3rd"), (4, "4th"), (11, "11th"), (12, "12th"), (13, "13th"), (21, "21st"), (23, "23rd"), (111, "111th")])
    func ordinal(n: Int, expected: String) {
        #expect(Calculator.ordinal(n) == expected)
    }
}
