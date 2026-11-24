import Foundation

/// Every read the screens make, as plain functions. Screens hand these to a Loader
/// (`Loader(API.home)`); being nonisolated, they can sit in a view's @State initializer.
enum API {
    static func home() async throws -> HomeResponse { try await APIClient.shared.get("home") }
    static func leaderboard() async throws -> LeaderboardResponse { try await APIClient.shared.get("leaderboard") }
    static func events() async throws -> EventsResponse { try await APIClient.shared.get("events") }
    static func event(_ slug: String) async throws -> EventDetailResponse { try await APIClient.shared.get("events/\(slug)") }
    static func athletes() async throws -> AthletesResponse { try await APIClient.shared.get("athletes") }
    static func guide() async throws -> GuideResponse { try await APIClient.shared.get("guide") }

    // MARK: Phase 2

    static func profile(_ athleteId: String) async throws -> ProfileView {
        try await APIClient.shared.get("athletes/\(athleteId)/profile")
    }
    /// Your own log; the admin passes an athlete to read theirs.
    static func practice(athleteId: String? = nil) async throws -> PracticeResponse {
        try await APIClient.shared.get("practice", query: athleteId.map { [URLQueryItem(name: "athlete", value: $0)] } ?? [])
    }
    static func proposals() async throws -> ProposalsResponse { try await APIClient.shared.get("proposals") }

    static func searchWalkout(_ query: String) async throws -> [WalkoutSong] {
        let reply: ActionReply<[WalkoutSong]> = try await APIClient.shared.get("walkout/search", query: [URLQueryItem(name: "q", value: query)])
        return reply.data ?? []
    }

    /// A write that answers `{ message }`; returns the message to show.
    @discardableResult
    static func write<B: Encodable & Sendable>(_ method: String, _ path: String, _ body: B) async throws -> String {
        let reply: ActionReply<Empty> = try await APIClient.shared.send(method, path, body: body)
        return reply.message
    }

    @discardableResult
    static func write(_ method: String, _ path: String) async throws -> String {
        try await write(method, path, Optional<Empty>.none)
    }

    // MARK: Phase 3

    static func vlog() async throws -> VlogResponse { try await APIClient.shared.get("vlog") }

    static func requestUpload(title: String, eventId: String?, confession: Bool, contentType: String, sizeBytes: Int) async throws -> UploadTicket {
        struct Body: Encodable, Sendable { let title: String; let eventId: String?; let confession: Bool; let contentType: String; let sizeBytes: Int }
        let reply: ActionReply<UploadTicket> = try await APIClient.shared.send(
            "POST", "vlog/uploads",
            body: Body(title: title, eventId: eventId, confession: confession, contentType: contentType, sizeBytes: sizeBytes)
        )
        guard let ticket = reply.data else { throw APIError.unreadable }
        return ticket
    }

    // MARK: Phase 4

    static func grid() async throws -> GridResponse { try await APIClient.shared.get("scores") }
    static func admin() async throws -> AdminResponse { try await APIClient.shared.get("admin") }
    static func changelog(page: Int, size: Int = 25) async throws -> ChangeLogResponse {
        try await APIClient.shared.get("changelog", query: [URLQueryItem(name: "page", value: "\(page)"),
                                                           URLQueryItem(name: "size", value: "\(size)")])
    }
    static func previewImport(csv: String) async throws -> ImportPreview {
        let reply: ActionReply<ImportPreview> = try await APIClient.shared.send("POST", "imports/preview", body: ["csv": csv])
        guard let preview = reply.data else { throw APIError.unreadable }
        return preview
    }
}
