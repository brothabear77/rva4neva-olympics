import Foundation

struct VlogVideo: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let title: String
    let athleteName: String
    /// The event's name, "Confession", or nil for a general clip.
    let eventName: String?
    /// Signed playback URL, good for an hour: reload the feed rather than caching it.
    let src: String
    let poster: String?
    let postedAt: Date
    let hearts: Int
    let hearted: Bool
    let canDelete: Bool
    /// A confession only its uploader can see until the games are finished.
    let `private`: Bool
}

struct VlogResponse: Codable, Sendable {
    struct Limits: Codable, Sendable { let maxBytes: Int; let contentTypes: [String] }
    struct EventOption: Codable, Sendable, Identifiable, Hashable { let id: String; let name: String }
    struct Confessions: Codable, Sendable { let items: [VlogVideo]; let isPublic: Bool }

    let configured: Bool
    let canUpload: Bool
    let limits: Limits
    let events: [EventOption]
    let videos: [VlogVideo]
    let confessions: Confessions
}

struct UploadTicket: Codable, Sendable {
    let videoId: String
    let uploadUrl: String
}
