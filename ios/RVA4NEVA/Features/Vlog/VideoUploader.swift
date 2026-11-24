import AVFoundation
import CoreTransferable
import Foundation
import UniformTypeIdentifiers

/// A video picked from Photos, copied to a temporary file we own.
struct PickedMovie: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            let ext = received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension
            let copy = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).\(ext)")
            try FileManager.default.copyItem(at: received.file, to: copy)
            return PickedMovie(url: copy)
        }
    }
}

/// Uploads a clip the way the site does: ask the API for a signed URL, PUT the file
/// straight to storage, then ask the API to confirm it arrived whole.
///
/// Before that, the clip is re-encoded to 1080p H.264 MP4. iPhone video is HEVC in a .mov,
/// often 4K: big enough to break the 500 MB limit in a minute or two, and HEVC doesn't
/// play in every browser that watches the site's feed.
@MainActor
@Observable
final class VideoUploader {
    enum Phase: Equatable {
        case idle
        case preparing
        case uploading(Double)
        case finishing
        case done(String)
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    private var task: Task<Void, Never>?

    var isBusy: Bool {
        switch phase {
        case .preparing, .uploading, .finishing: true
        default: false
        }
    }

    func start(movie: URL, title: String, eventId: String?, confession: Bool, maxBytes: Int) {
        task?.cancel()
        task = Task { await run(movie: movie, title: title, eventId: eventId, confession: confession, maxBytes: maxBytes) }
    }

    func cancel() {
        task?.cancel()
        phase = .idle
    }

    private func run(movie: URL, title: String, eventId: String?, confession: Bool, maxBytes: Int) async {
        var exported: URL?
        defer {
            try? FileManager.default.removeItem(at: movie)
            if let exported { try? FileManager.default.removeItem(at: exported) }
        }
        do {
            phase = .preparing
            let file = try await Self.exportMP4(movie)
            exported = file
            let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0 else { throw UploadError("That video is empty.") }
            guard size <= maxBytes else {
                throw UploadError("That video is \(size / 1_048_576) MB even after compressing; the limit is \(maxBytes / 1_048_576) MB. Trim it and try again.")
            }

            let ticket = try await API.requestUpload(title: title, eventId: eventId, confession: confession,
                                                     contentType: "video/mp4", sizeBytes: size)
            guard let uploadURL = URL(string: ticket.uploadUrl) else { throw APIError.unreadable }

            phase = .uploading(0)
            try await Self.put(file: file, to: uploadURL, contentType: "video/mp4") { [weak self] fraction in
                Task { @MainActor in
                    if case .uploading = self?.phase { self?.phase = .uploading(fraction) }
                }
            }
            try Task.checkCancellation()

            phase = .finishing
            phase = .done(try await API.write("POST", "vlog/\(ticket.videoId)/finish"))
        } catch is CancellationError {
            phase = .idle
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    /// Re-encodes to 1080p H.264 in an MP4 container.
    private static func exportMP4(_ source: URL) async throws -> URL {
        let asset = AVURLAsset(url: source)
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1920x1080) else {
            throw UploadError("This video can't be prepared for upload.")
        }
        session.shouldOptimizeForNetworkUse = true
        let output = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).mp4")
        do {
            try await session.export(to: output, as: .mp4)
        } catch {
            throw UploadError("Couldn't prepare the video: \(error.localizedDescription)")
        }
        return output
    }

    /// The signed PUT. No Authorization header: the URL itself is the permission, and the
    /// Content-Type must match the one signed. URLSession sets Content-Length from the file.
    private static func put(file: URL, to url: URL, contentType: String,
                            progress: @escaping @Sendable (Double) -> Void) async throws {
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (_, response) = try await URLSession.shared.upload(for: request, fromFile: file,
                                                               delegate: ProgressDelegate(progress))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw UploadError("Storage refused the upload (\(status)). Try again.") }
    }
}

struct UploadError: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

private final class ProgressDelegate: NSObject, URLSessionTaskDelegate, Sendable {
    let report: @Sendable (Double) -> Void
    init(_ report: @escaping @Sendable (Double) -> Void) { self.report = report }

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                    totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        report(Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }
}
