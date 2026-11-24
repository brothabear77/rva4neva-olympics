import Foundation

/// Errors from the olympics API, already worded for the person (the server writes the messages).
enum APIError: LocalizedError, Equatable {
    /// 401: no session, or it expired. The app drops the token and shows Sign in.
    case signedOut(String)
    /// 403: signed in, but this account can't do that.
    case forbidden(String)
    /// Any other refusal the server explained (400, 404, 500 …).
    case server(status: Int, message: String)
    /// Couldn't reach the server at all.
    case offline(String)
    /// The server answered with something this build doesn't understand.
    case unreadable

    var errorDescription: String? {
        switch self {
        case .signedOut(let m), .forbidden(let m), .offline(let m): m
        case .server(_, let m): m
        case .unreadable: "The server sent something unexpected. Try updating the app."
        }
    }
}

/// Talks JSON to the site's /api/v1. One shared instance; the session token lives here
/// (and in the Keychain, so it survives relaunches).
actor APIClient {
    static let shared = APIClient(baseURL: APIClient.configuredBaseURL)

    nonisolated let baseURL: URL
    private var token: String?
    private let session: URLSession

    init(baseURL: URL) {
        self.baseURL = baseURL
        self.token = KeychainStore.read()
        let config = URLSessionConfiguration.default
        // A paused Aurora takes ~15s to wake; leave room for it.
        config.timeoutIntervalForRequest = 30
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        // The API is bearer-only; keep the website's cookie out of it.
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        self.session = URLSession(configuration: config)
    }

    /// From Info.plist's API_BASE_URL, which the Debug/Release xcconfig sets.
    static var configuredBaseURL: URL {
        let raw = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? ""
        return URL(string: raw) ?? URL(string: "http://localhost:3000")!
    }

    /// A file the site serves from public/ ("/athletes/nick.jpg"), or an absolute URL as-is.
    nonisolated func assetURL(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if path.hasPrefix("http://") || path.hasPrefix("https://") { return URL(string: path) }
        return URL(string: path, relativeTo: baseURL)?.absoluteURL
    }

    var hasToken: Bool { token != nil }

    func setToken(_ newValue: String?) {
        token = newValue
        if let newValue { KeychainStore.save(newValue) } else { KeychainStore.delete() }
    }

    // MARK: Requests

    func get<T: Decodable & Sendable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await send("GET", path, query: query, body: Optional<Empty>.none)
    }

    func send<T: Decodable & Sendable, B: Encodable & Sendable>(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        body: B?
    ) async throws -> T {
        var url = baseURL.appending(path: "api/v1").appending(path: path)
        if !query.isEmpty { url.append(queryItems: query) }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .timedOut {
            throw APIError.offline("The server is taking a while to wake up. Pull to try again.")
        } catch {
            throw APIError.offline("Can't reach the server. Check your connection.")
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
                ?? "Something went wrong (\(status))."
            switch status {
            case 401:
                // The session is gone server-side (expired, signed out elsewhere, account
                // removed): forget it here too, and tell the app so it stops showing you signed in.
                if token != nil {
                    setToken(nil)
                    NotificationCenter.default.post(name: .sessionExpired, object: nil)
                }
                throw APIError.signedOut(message)
            case 403: throw APIError.forbidden(message)
            default: throw APIError.server(status: status, message: message)
            }
        }

        do {
            return try JSONDecoder.api.decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("Decoding \(T.self) from \(path) failed: \(error)")
            #endif
            throw APIError.unreadable
        }
    }
}

struct Empty: Codable, Sendable {}

extension Notification.Name {
    /// Posted when the server refuses the saved session token.
    static let sessionExpired = Notification.Name("RVA4NEVASessionExpired")
}
private struct ErrorBody: Decodable { let error: String }

extension JSONDecoder {
    /// The server's dates are ISO 8601 with milliseconds ("2027-09-04T11:00:00.000Z").
    static var api: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(raw) { return date }
            if let date = try? Date(raw, strategy: .iso8601) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date \(raw)"))
        }
        return decoder
    }
}
