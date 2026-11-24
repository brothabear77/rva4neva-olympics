import AVKit
import PhotosUI
import SwiftUI

/// Training clips and highlights, plus the confessions (private to their uploader until
/// the games are finished). Behind the "show-vlog-page" flag, like the site's page.
struct VlogView: View {
    @Environment(AppState.self) private var app
    @State private var loader = Loader<VlogResponse>(API.vlog)
    @State private var tab = Tab.feed
    @State private var uploading = false
    @State private var feedback: Feedback?

    enum Tab: String, CaseIterable { case feed = "Feed", confessions = "Confessions" }

    var body: some View {
        LoadingView(loader: loader) { vlog in
            let videos = tab == .feed ? vlog.videos : vlog.confessions.items
            List {
                Section {
                    Picker("Show", selection: $tab) {
                        ForEach(Tab.allCases, id: \.self) { Text($0.rawValue) }
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    if tab == .confessions && !vlog.confessions.isPublic {
                        Text("Confessions stay private to whoever recorded them until the games are finished. You're only seeing your own.")
                    }
                }
                .listRowBackground(Color.clear)

                if !vlog.configured {
                    Text("Video storage isn't set up on this server.").foregroundStyle(Theme.muted)
                        .listRowBackground(Color.clear)
                } else if videos.isEmpty {
                    ContentUnavailableView(tab == .feed ? "No videos yet" : "No confessions yet", systemImage: "video",
                                           description: Text(vlog.canUpload ? "Share one with +." : ""))
                        .listRowBackground(Color.clear)
                }

                ForEach(videos) { video in
                    VideoCard(video: video, canHeart: app.account?.role == .athlete && !video.private,
                              heart: { hearted in toggleHeart(video, hearted) },
                              delete: { delete(video) })
                        .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            }
            .listStyle(.plain)
            .toolbar {
                if vlog.canUpload {
                    ToolbarItem(placement: .primaryAction) {
                        Button { uploading = true } label: { Label("Upload", systemImage: "plus") }
                    }
                }
            }
            .sheet(isPresented: $uploading) {
                NavigationStack {
                    UploadForm(events: vlog.events, maxBytes: vlog.limits.maxBytes) { message in
                        uploading = false
                        feedback = .success(message)
                        Task { await loader.load() }
                    }
                }
                .interactiveDismissDisabled()
            }
        }
        .screenBackground()
        .navigationTitle("Vlog")
        .feedbackAlert($feedback)
        .task { await loader.load() }
        .refreshable { await loader.load() }
    }

    private func toggleHeart(_ video: VlogVideo, _ hearted: Bool) {
        Task {
            do {
                try await API.write(hearted ? "PUT" : "DELETE", "vlog/\(video.id)/heart")
            } catch {
                feedback = .failure(error)
            }
            await loader.load()
        }
    }

    private func delete(_ video: VlogVideo) {
        Task {
            do {
                feedback = .success(try await API.write("DELETE", "vlog/\(video.id)"))
            } catch {
                feedback = .failure(error)
            }
            await loader.load()
        }
    }
}

private struct VideoCard: View {
    let video: VlogVideo
    let canHeart: Bool
    let heart: (Bool) -> Void
    let delete: () -> Void

    @State private var player: AVPlayer?
    @State private var confirmingDelete = false
    /// Shown at once on tap, before the server answers; the reload then settles it.
    @State private var optimistic: (hearted: Bool, count: Int)?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                if let player {
                    VideoPlayer(player: player)
                } else {
                    // Built on tap, so a long feed doesn't open a stream per clip.
                    Button {
                        if let url = URL(string: video.src) {
                            let p = AVPlayer(url: url)
                            player = p
                            p.play()
                        }
                    } label: {
                        ZStack {
                            AsyncImage(url: APIClient.shared.assetURL(video.poster)) { $0.resizable().scaledToFill() } placeholder: { Theme.ink }
                            Image(systemName: "play.circle.fill").font(.system(size: 56)).foregroundStyle(.white, .black.opacity(0.5))
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Play \(video.title)")
                }
            }
            .aspectRatio(16 / 9, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .onDisappear { player?.pause() }

            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(video.title).font(.headline).foregroundStyle(Theme.paper)
                    HStack(spacing: 4) {
                        Text(video.athleteName)
                        if let event = video.eventName { Text("· \(event)") }
                        Text("· \(video.postedAt, format: .relative(presentation: .named))")
                    }
                    .font(.caption).foregroundStyle(Theme.muted)
                    if video.private {
                        Label("Private until the games end", systemImage: "lock").font(.caption2).foregroundStyle(Theme.muted)
                    }
                }
                Spacer()
                if !video.private { heartButton }
                if video.canDelete {
                    Menu {
                        Button("Delete video", role: .destructive) { confirmingDelete = true }
                    } label: {
                        Image(systemName: "ellipsis").padding(8).foregroundStyle(Theme.muted)
                    }
                }
            }
        }
        .padding(.horizontal)
        .onChange(of: video) { optimistic = nil }
        .confirmationDialog("Delete “\(video.title)”?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive, action: delete)
        }
    }

    private var heartButton: some View {
        let hearted = optimistic?.hearted ?? video.hearted
        let count = optimistic?.count ?? video.hearts
        return Button {
            optimistic = (!hearted, count + (hearted ? -1 : 1))
            heart(!hearted)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: hearted ? "heart.fill" : "heart")
                    .foregroundStyle(hearted ? .red : Theme.muted)
                    .contentTransition(.symbolEffect(.replace))
                Text("\(count)").monospacedDigit().foregroundStyle(Theme.muted)
            }
            .font(.subheadline)
        }
        .buttonStyle(.plain)
        .disabled(!canHeart)
        .accessibilityLabel(hearted ? "Remove heart, \(count) hearts" : "Heart, \(count) hearts")
    }
}

private struct UploadForm: View {
    let events: [VlogResponse.EventOption]
    let maxBytes: Int
    let onDone: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var uploader = VideoUploader()
    @State private var pick: PhotosPickerItem?
    @State private var movie: URL?
    @State private var loadingPick = false
    @State private var title = ""
    @State private var eventId = ""
    @State private var confession = false
    @State private var pickError: String?

    var body: some View {
        Form {
            Section {
                // Worked out here: the picker's label closure can't read @State.
                let pickLabel = movie == nil ? "Choose a video" : "Choose a different video"
                PhotosPicker(selection: $pick, matching: .videos, preferredItemEncoding: .current) {
                    Label(pickLabel, systemImage: "video.badge.plus")
                }
                .disabled(uploader.isBusy)
                if loadingPick { ProgressView("Getting the video…") }
                if let movie { VideoPlayer(player: AVPlayer(url: movie)).aspectRatio(16 / 9, contentMode: .fit) }
                if let pickError { Text(pickError).foregroundStyle(.red) }
            }
            .listRowBackground(Theme.surface.opacity(0.45))

            Section {
                TextField("Title", text: $title)
                Toggle("Confession", isOn: $confession)
                if !confession {
                    Picker("Event", selection: $eventId) {
                        Text("None").tag("")
                        ForEach(events) { Text($0.name).tag($0.id) }
                    }
                }
            } footer: {
                Text(confession
                     ? "A confession stays private to you until the games are finished, then everyone sees it."
                     : "Videos are compressed to 1080p before uploading.")
            }
            .listRowBackground(Theme.surface.opacity(0.45))
            .disabled(uploader.isBusy)

            Section { status }
                .listRowBackground(Theme.surface.opacity(0.45))
        }
        .screenBackground()
        .navigationTitle("Upload a video")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(uploader.isBusy ? "Stop" : "Cancel") {
                    uploader.cancel()
                    dismiss()
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Upload") {
                    guard let movie else { return }
                    uploader.start(movie: movie, title: title, eventId: eventId.isEmpty ? nil : eventId,
                                   confession: confession, maxBytes: maxBytes)
                    self.movie = nil  // the uploader owns (and deletes) the file now
                }
                .disabled(movie == nil || title.trimmingCharacters(in: .whitespaces).isEmpty || title.count > 120 || uploader.isBusy)
            }
        }
        .onChange(of: pick) { _, item in load(item) }
        .onChange(of: uploader.phase) { _, phase in
            if case .done(let message) = phase { onDone(message) }
        }
    }

    @ViewBuilder private var status: some View {
        switch uploader.phase {
        case .idle, .done:
            EmptyView()
        case .preparing:
            ProgressView("Compressing…")
        case .uploading(let fraction):
            ProgressView(value: fraction) { Text("Uploading \(Int(fraction * 100))%") }.tint(Theme.accent)
        case .finishing:
            ProgressView("Finishing…")
        case .failed(let message):
            Text(message).foregroundStyle(.red)
        }
    }

    private func load(_ item: PhotosPickerItem?) {
        guard let item else { return }
        loadingPick = true
        pickError = nil
        Task {
            defer { loadingPick = false }
            do {
                if let old = movie { try? FileManager.default.removeItem(at: old) }
                movie = try await item.loadTransferable(type: PickedMovie.self)?.url
                if movie == nil { pickError = "Couldn't read that video." }
            } catch {
                pickError = "Couldn't read that video: \(error.localizedDescription)"
            }
        }
    }
}
