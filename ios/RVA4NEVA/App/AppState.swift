import SwiftUI

/// Who is signed in, what they may see, and the site's static config. One per app,
/// shared through the environment.
@MainActor
@Observable
final class AppState {
    private(set) var me: Me?
    private(set) var config: SiteConfig?
    var account: Account? { me?.account }
    var flags: Flags? { me?.flags }

    private let api = APIClient.shared

    /// On launch: config and whoever the saved token belongs to.
    func bootstrap() async {
        async let config: SiteConfig? = try? api.get("config")
        await refreshMe()
        self.config = await config
    }

    func refreshMe() async {
        if let me: Me = try? await api.get("me") { self.me = me }
    }

    func signIn(username: String, password: String) async throws {
        let response: AuthResponse = try await api.send(
            "POST", "auth/login", body: ["username": username, "password": password]
        )
        await api.setToken(response.token)
        me = response.me
    }

    func register(name: String, username: String, password: String, confirm: String) async throws -> String {
        struct Body: Encodable, Sendable { let name, username, password, confirm: String }
        struct Response: Decodable, Sendable {
            let token: String
            let message: String
            let account: Account?
            let flags: Flags
            let registrationLocked: Bool
        }
        let response: Response = try await api.send(
            "POST", "auth/register", body: Body(name: name, username: username, password: password, confirm: confirm)
        )
        await api.setToken(response.token)
        me = Me(account: response.account, flags: response.flags, registrationLocked: response.registrationLocked)
        return response.message
    }

    func signOut() async {
        let _: MessageResponse? = try? await api.send("POST", "auth/logout", body: Optional<Empty>.none)
        await api.setToken(nil)
        await refreshMe()
    }
}
