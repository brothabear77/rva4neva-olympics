import Foundation

// Phase 4: the score grid, CSV import, change history, and the admin panel.

struct GridResponse: Codable, Sendable {
    struct Athlete: Codable, Sendable, Identifiable, Hashable { let id: String; let name: String }
    struct Value: Codable, Sendable, Hashable { let athleteId: String; let eventId: String; let rawValue: Double }
    let events: [Event]
    let athletes: [Athlete]
    let values: [Value]
    /// The open-submission flag is off: nothing can be added, removed or restored.
    let locked: Bool
}

struct ImportPreview: Codable, Sendable {
    enum Action: String, Codable, Sendable { case create, update, unchanged, error }
    struct Row: Codable, Sendable, Identifiable, Hashable {
        let line: Int
        let eventSlug: String
        let athleteName: String
        let action: Action
        let eventName: String?
        let unitLabel: String?
        let decimals: Int?
        let rawValue: Double?
        let points: Int?
        let previousRawValue: Double?
        let previousPoints: Int?
        let error: String?
        var id: Int { line }
    }
    let rows: [Row]
    let counts: [String: Int]
    let fileErrors: [String]
    let missingColumns: [String]
    let canCommit: Bool
}

/// Any JSON value: the change history's stored rows, whose shape depends on the table.
enum JSONValue: Codable, Sendable, Hashable {
    case string(String), number(Double), bool(Bool), null
    case array([JSONValue]), object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }

    var display: String {
        switch self {
        case .string(let v): v.isEmpty ? "—" : v
        case .number(let v): v.rounded() == v && abs(v) < 1e15 ? String(Int(v)) : String(v)
        case .bool(let v): v ? "yes" : "no"
        case .null: "—"
        case .array, .object: "…"
        }
    }
}

struct ChangeLogEntry: Codable, Sendable, Identifiable, Hashable {
    let id: Int
    let tableName: String
    let recordId: String?
    let operation: String
    let oldRow: [String: JSONValue]?
    let newRow: [String: JSONValue]?
    let changedBy: String
    let changedAt: Date
    let restoredFromId: Int?
    let label: String
    /// What Undo would put back, formatted; nil when this entry can't be undone.
    let restoreTo: String?
    let removedWithAccount: Bool
    let unrecoverable: Bool

    var operationLabel: String {
        ["INSERT": "Added", "UPDATE": "Changed", "DELETE": "Removed", "RESTORE": "Restored"][operation] ?? operation
    }

    /// What undoing does, in words (src/components/ChangeLogTable.tsx undoText).
    var undoText: String? {
        guard let restoreTo else { return nil }
        if operation == "INSERT" && tableName == "results" { return "Undo — remove this score" }
        return (operation == "INSERT" || operation == "DELETE" ? "Restore " : "Undo — back to ") + restoreTo
    }

    /// The fields worth showing, old → new (ChangeLogTable's INTERESTING).
    var changes: [(field: String, old: String?, new: String?)] {
        let fields: [(String, String)] = switch tableName {
        case "results": [("raw_value", "Mark"), ("points", "Points"), ("notes", "Notes"), ("submitted_by", "Posted by")]
        case "events": [("name", "Name"), ("benchmark_standard", "100-pt mark"), ("benchmark_zero", "0-pt mark"), ("decimals", "Decimals")]
        case "athletes": [("name", "Name")]
        default: []
        }
        return fields.compactMap { key, label in
            let old = oldRow?[key]?.display, new = newRow?[key]?.display
            if old == nil && new == nil { return nil }
            if operation == "UPDATE" && old == new { return nil }
            return (label, old, new)
        }
    }
}

struct ChangeLogResponse: Codable, Sendable {
    let entries: [ChangeLogEntry]
    let total: Int
    let page: Int
    let pageCount: Int
    let size: Int
    let locked: Bool
    let canRestore: Bool
}

struct AdminAccount: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let name: String
    let username: String
    let athleteId: String?
    let role: Role
    let isStaff: Bool
    let createdAt: Date
}

struct AdminResponse: Codable, Sendable {
    let accounts: [AdminAccount]
    let registrationLocked: Bool
    let events: [Event]
}
