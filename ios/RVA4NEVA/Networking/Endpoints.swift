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
}
