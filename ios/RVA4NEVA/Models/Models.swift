import Foundation

// Codable mirrors of what /api/v1 returns. Field names match the server's JSON
// (src/lib/queries.ts, src/lib/apiViews.ts), so no CodingKeys are needed.

enum Role: String, Codable, Sendable {
    case athlete, scorekeeper, admin
}

struct Account: Codable, Sendable, Equatable {
    let accountId: String
    let role: Role
    let athleteId: String?
    let displayName: String
    let username: String?

    var canScore: Bool { role == .scorekeeper || role == .admin }
    /// Athletes and the admin: who the Athletes pages are for. Scorekeepers are not members.
    var isMember: Bool { role == .athlete || role == .admin }
    var isAdmin: Bool { role == .admin }
}

struct Flags: Codable, Sendable, Equatable {
    let openSubmission: Bool
    let showChampion: Bool
    let showVlog: Bool
}

struct Me: Codable, Sendable, Equatable {
    let account: Account?
    let flags: Flags
    let registrationLocked: Bool
}

struct AuthResponse: Codable, Sendable {
    let token: String
    let expiresAt: Date
    let account: Account?
    let flags: Flags
    let registrationLocked: Bool

    var me: Me { Me(account: account, flags: flags, registrationLocked: registrationLocked) }
}

struct MessageResponse: Codable, Sendable { let message: String }

// MARK: Config

struct SiteDay: Codable, Sendable, Hashable {
    let day: Int
    let label: String
    let date: String
}

struct Quote: Codable, Sendable, Hashable {
    let text: String
    let author: String?
}

struct SiteConfig: Codable, Sendable {
    struct Site: Codable, Sendable {
        let name: String
        let shortName: String
        let tagline: String
        let timeZone: String
        let startsAt: Date
        let days: [SiteDay]
    }
    let site: Site
    let quotes: [Quote]
}

// MARK: Events and results

struct Event: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let description: String
    let unitLabel: String
    let day: Int
    let sortOrder: Int
    let benchmarkStandard: Double
    let benchmarkZero: Double
    let decimals: Int
    let isActive: Bool
    // Present on /events (EventSummary), absent elsewhere.
    let resultCount: Int?
    let leaderName: String?
    let leaderPoints: Int?
    let leaderRaw: Double?

    var scoring: ScoringConfig { ScoringConfig(benchmarkStandard: benchmarkStandard, benchmarkZero: benchmarkZero) }
    /// "Day 1.2": the day, then the event's place within it.
    var dayTag: String { "Day \(day).\(sortOrder)" }
    func format(_ raw: Double) -> String {
        let value = Scoring.formatMeasurement(raw, decimals: decimals)
        return unitLabel.isEmpty ? value : "\(value) \(unitLabel)"
    }
}

struct ResultRow: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let eventId: String
    let eventSlug: String
    let eventName: String
    let eventUnit: String
    let eventDecimals: Int
    let athleteId: String
    let athleteName: String
    let rawValue: Double
    let points: Int
    let notes: String
    let submittedBy: String
    let source: String
    let createdAt: Date
    let updatedAt: Date

    var formattedRaw: String {
        let value = Scoring.formatMeasurement(rawValue, decimals: eventDecimals)
        return eventUnit.isEmpty ? value : "\(value) \(eventUnit)"
    }
}

struct LeaderboardEntry: Codable, Sendable, Identifiable, Hashable {
    let rank: Int
    let wonOnTiebreak: Bool
    let athleteId: String
    let athleteName: String
    let totalPoints: Int
    let eventsCompleted: Int
    let best: ResultRow?
    let byEventId: [String: ResultRow]

    var id: String { athleteId }
}

struct TieGroup: Codable, Sendable, Hashable {
    struct Score: Codable, Sendable, Hashable {
        let points: Int
        let eventName: String
    }
    struct Athlete: Codable, Sendable, Hashable, Identifiable {
        let athleteId: String
        let athleteName: String
        let rank: Int
        let scores: [Score]
        let settledAt: Int?
        let highlightAt: Int?
        var id: String { athleteId }
    }
    let totalPoints: Int
    let athletes: [Athlete]
    let depth: Int
    let decidedAt: [Int?]
}

struct Superlative: Codable, Sendable, Hashable {
    struct Category: Codable, Sendable, Hashable {
        struct Weighted: Codable, Sendable, Hashable { let slug: String; let weight: Double }
        let slug: String
        let label: String
        let events: [Weighted]
    }
    struct Standing: Codable, Sendable, Hashable, Identifiable {
        let athleteId: String
        let athleteName: String
        let score: Int
        let eventsCounted: Int
        let eventsInCategory: Int
        var id: String { athleteId }
    }
    let category: Category
    let standings: [Standing]
    let leaders: [Standing]
}

struct LeaderboardResponse: Codable, Sendable {
    let entries: [LeaderboardEntry]
    let events: [Event]
    let ties: [TieGroup]
    let superlatives: [Superlative]
}

struct EventsResponse: Codable, Sendable { let events: [Event] }

struct EventDetailResponse: Codable, Sendable {
    let event: Event
    let guide: GuideEvent?
    let results: [ResultRow]
}

// MARK: Guide

struct GuideMedia: Codable, Sendable, Hashable {
    /// "image", "gif", "video" or "youtube".
    let kind: String
    let src: String?
    /// The YouTube video id, for kind "youtube".
    let id: String?
    let start: Int?
    let poster: String?
    let caption: String?
    let label: String

    var youtubeURL: URL? {
        guard kind == "youtube", let id else { return nil }
        return URL(string: "https://www.youtube.com/watch?v=\(id)\(start.map { "&t=\($0)s" } ?? "")")
    }
}

struct LadderStep: Codable, Sendable, Hashable {
    let points: Int
    let mark: String
}

struct GuideEvent: Codable, Sendable, Identifiable, Hashable {
    struct Scale: Codable, Sendable, Hashable {
        let top: String
        let zero: String
        let ladder: [LadderStep]
    }
    let id: String
    let slug: String
    let name: String
    let day: Int
    let sortOrder: Int
    let unitLabel: String
    let summary: String
    let rules: [String]
    let media: GuideMedia?
    let scale: Scale?
}

struct GuideResponse: Codable, Sendable { let events: [GuideEvent] }

// MARK: Athletes

struct WalkoutSong: Codable, Sendable, Hashable {
    /// "track" or "episode".
    let kind: String
    let spotifyId: String
    let title: String
    let artists: String
    let albumArtUrl: String?

    var spotifyURL: URL? { URL(string: "https://open.spotify.com/\(kind)/\(spotifyId)") }
}

struct AthleteSummary: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let name: String
    let photo: String?
    let tagline: String?
    let bio: String?
    let walkout: WalkoutSong?
    let rank: Int
    let totalPoints: Int
    let eventsCompleted: Int
    let best: ResultRow?
}

struct AthletesResponse: Codable, Sendable {
    let eventCount: Int
    let athletes: [AthleteSummary]
}

// MARK: Home

struct Champion: Codable, Sendable, Identifiable, Hashable {
    let athleteId: String
    let athleteName: String
    let totalPoints: Int
    let photo: String?
    let walkout: WalkoutSong?
    var id: String { athleteId }
}

struct ScheduleItem: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let day: Int
    let sortOrder: Int
}

struct HomeResponse: Codable, Sendable {
    let started: Bool
    let startsAt: Date
    let finished: Bool
    let podium: [LeaderboardEntry]
    let recent: [ResultRow]
    let champions: [Champion]
    let events: [ScheduleItem]
}
