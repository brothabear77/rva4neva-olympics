import Testing
@testable import RVA4NEVA

// Mirrors src/lib/__tests__/grid.test.ts.

@Suite("Grid.parseCell")
struct ParseCellTests {
    @Test func emptyAndWhitespace() {
        #expect(Grid.parseCell("") == .empty)
        #expect(Grid.parseCell("   ") == .empty)
    }
    @Test func numbers() {
        #expect(Grid.parseCell("5.42") == .number(5.42))
        #expect(Grid.parseCell(" 7 ") == .number(7))
        #expect(Grid.parseCell("-3") == .number(-3))
        #expect(Grid.parseCell(".5") == .number(0.5))
        #expect(Grid.parseCell("5.") == .number(5))
    }
    @Test func notMeasurements() {
        #expect(Grid.parseCell("-") == .invalid)
        #expect(Grid.parseCell(".") == .invalid)
        #expect(Grid.parseCell("abc") == .invalid)
        #expect(Grid.parseCell("1e5") == .invalid)
        #expect(Grid.parseCell("5,4") == .invalid)
    }
    @Test func roundsToStoredPrecision() {
        #expect(Grid.parseCell("5.123456") == .number(5.1235))
    }
    @Test func range() {
        #expect(Grid.parseCell("99999999.99999") == .invalid)
        #expect(Grid.parseCell("99999999") == .number(99_999_999))
    }
}

@Suite("Grid.collectChanges")
struct CollectChangesTests {
    let athletes = [(id: "a", name: "Ann"), (id: "b", name: "Ben")]
    let original = ["a|e": 5.42]

    @Test func untouchedCellsAreIgnored() {
        #expect(Grid.collectChanges(athletes: athletes, eventIds: ["e"], original: original, edits: [:]).changes.isEmpty)
    }
    @Test func retypingTheSameValueIsNotAChange() {
        let diff = Grid.collectChanges(athletes: athletes, eventIds: ["e"], original: original, edits: ["a|e": "5.420"])
        #expect(diff.changes.isEmpty)
    }
    @Test func blankNeverDeletes() {
        let diff = Grid.collectChanges(athletes: athletes, eventIds: ["e"], original: original, edits: ["a|e": ""])
        #expect(diff.changes.isEmpty)
    }
    @Test func newAndChangedValues() {
        let diff = Grid.collectChanges(athletes: athletes, eventIds: ["e"], original: original, edits: ["a|e": "6", "b|e": "4.1"])
        #expect(diff.changes.map(\.athleteName) == ["Ann", "Ben"])
        #expect(diff.changes.map(\.value) == [6, 4.1])
    }
    @Test func invalidBlocks() {
        let diff = Grid.collectChanges(athletes: athletes, eventIds: ["e"], original: original, edits: ["b|e": "-"])
        #expect(diff.invalidKeys == ["b|e"])
    }
}
