import Foundation

// Phase 2: profile, walkout songs, practice log, proposals.

struct ProfileView: Codable, Sendable {
    let athleteId: String
    let name: String
    let tagline: String
    let bio: String
    let photo: String
    let walkout: WalkoutSong?
}

/// A server action's reply: `{ message, data? }`.
struct ActionReply<T: Decodable & Sendable>: Decodable, Sendable {
    let message: String
    let data: T?
}

struct PracticeAttempt: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let eventId: String
    let rawValue: Double
    /// A calendar date in the games' time zone, "2026-10-06".
    let attemptedOn: String
    let notes: String

    /// Noon UTC, so the day never slips when shown in another zone (as the site does).
    var date: Date {
        (try? Date("\(attemptedOn)T12:00:00Z", strategy: .iso8601)) ?? .distantPast
    }
}

struct PracticeResponse: Codable, Sendable {
    let athleteId: String
    /// Today in the games' time zone: the latest date an attempt can have.
    let today: String
    let events: [Event]
    let attempts: [PracticeAttempt]
}

enum ProposalStatus: String, Codable, Sendable {
    case open, withdrawn, passed, rejected
    case noQuorum = "no-quorum"

    var label: String {
        switch self {
        case .open: "Open"
        case .withdrawn: "Withdrawn"
        case .passed: "Passed"
        case .rejected: "Rejected"
        case .noQuorum: "No quorum"
        }
    }
}

struct Proposal: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let title: String
    let body: String
    let proposerId: String
    let proposerName: String
    let createdAt: Date
    let closesAt: Date
    let withdrawnAt: Date?
    let yes: Int
    let no: Int
    let eligible: Int
    /// true = Yes, false = No, nil = hasn't voted.
    let myVote: Bool?
    let status: ProposalStatus
    let quorum: Int
    let mine: Bool
}

struct ProposalsResponse: Codable, Sendable {
    struct Limits: Codable, Sendable { let maxOpen: Int; let maxTitle: Int; let maxBody: Int }
    let proposals: [Proposal]
    let serverNow: Date
    let limits: Limits
}
