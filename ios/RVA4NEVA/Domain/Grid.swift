import Foundation

/// The score grid's rules, ported from src/lib/grid.ts so the app and the site agree
/// on what counts as a change. RVA4NEVATests/GridTests mirrors grid.test.ts.
enum Grid {
    static let maxRawValue = 1e8
    /// Decimal places results.raw_value keeps (numeric(12,4)).
    static let rawValueDecimals = 4

    enum Cell: Equatable {
        case empty
        case invalid
        case number(Double)
    }

    static func key(athleteId: String, eventId: String) -> String { "\(athleteId)|\(eventId)" }

    /// What a cell's text means once typing has stopped.
    static func parseCell(_ text: String) -> Cell {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return .empty }
        // A lone "-" or "." is not a measurement.
        guard trimmed.wholeMatch(of: /-?(\d+\.?\d*|\.\d+)/) != nil, let number = Double(trimmed) else { return .invalid }
        // Round to what the database keeps, or 5.123456 would never equal what comes back.
        let factor = pow(10, Double(rawValueDecimals))
        let value = Double(Scoring.jsRound(number * factor)) / factor
        guard value.isFinite, abs(value) < maxRawValue else { return .invalid }
        return .number(value)
    }

    struct Change: Encodable, Sendable, Hashable {
        let athleteId: String
        let athleteName: String
        let eventId: String
        let value: Double
    }

    struct Diff {
        var changes: [Change] = []
        var invalidKeys: Set<String> = []
    }

    /// Compare what was typed against what is stored. A touched cell equal to the stored
    /// value (compared as numbers: 5.420 == 5.42) is not a change, and a blank cell never
    /// is: blank means "nothing to say here", never "delete this".
    static func collectChanges(
        athletes: [(id: String, name: String)],
        eventIds: [String],
        original: [String: Double],
        edits: [String: String]
    ) -> Diff {
        var diff = Diff()
        for athlete in athletes {
            for eventId in eventIds {
                let key = key(athleteId: athlete.id, eventId: eventId)
                guard let text = edits[key] else { continue }
                switch parseCell(text) {
                case .invalid:
                    diff.invalidKeys.insert(key)
                case .number(let value) where value != original[key]:
                    diff.changes.append(Change(athleteId: athlete.id, athleteName: athlete.name, eventId: eventId, value: value))
                default:
                    break
                }
            }
        }
        return diff
    }
}
