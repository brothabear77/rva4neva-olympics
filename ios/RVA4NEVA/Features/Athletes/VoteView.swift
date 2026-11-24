import SwiftUI

/// Group proposals: a week to vote, half the athletes for a quorum, more Yes than No to pass.
struct VoteView: View {
    @Environment(AppState.self) private var app
    @State private var loader = Loader<ProposalsResponse>(API.proposals)
    @State private var composing = false
    @State private var feedback: Feedback?

    var body: some View {
        LoadingView(loader: loader) { response in
            let open = response.proposals.filter { $0.status == .open }
            let closed = response.proposals.filter { $0.status != .open }
            List {
                Section {
                    if open.isEmpty {
                        Text("Nothing to vote on. Propose something with +.").foregroundStyle(Theme.muted)
                    }
                    ForEach(open) { proposal in
                        ProposalCard(proposal: proposal, canModerate: app.account?.isAdmin == true, act: act)
                    }
                } header: {
                    Text("Open")
                } footer: {
                    Text("A proposal passes when at least half of all athletes vote and more vote Yes than No. Voting closes after a week, or a minute after everyone has voted.")
                }
                .listRowBackground(Theme.surface.opacity(0.45))

                if !closed.isEmpty {
                    Section("Closed") {
                        ForEach(closed) { proposal in
                            ProposalCard(proposal: proposal, canModerate: app.account?.isAdmin == true, act: act)
                        }
                    }
                    .listRowBackground(Theme.surface.opacity(0.45))
                }
            }
        }
        .screenBackground()
        .navigationTitle("Vote")
        .toolbar {
            // Proposing and voting are for athletes; the admin has no athlete and only moderates.
            if app.account?.athleteId != nil {
                ToolbarItem(placement: .primaryAction) {
                    Button { composing = true } label: { Label("New proposal", systemImage: "plus") }
                }
            }
        }
        .sheet(isPresented: $composing) {
            NavigationStack {
                ProposalForm(limits: loader.value?.limits) { message in
                    composing = false
                    feedback = .success(message)
                    Task { await loader.load() }
                }
            }
        }
        .feedbackAlert($feedback)
        .task { await loader.load() }
        .refreshable { await loader.load() }
        .polling(every: .seconds(15)) { await loader.load() }
    }

    private func act(_ op: @escaping @Sendable () async throws -> String) {
        Task {
            do {
                _ = try await op()
            } catch {
                feedback = .failure(error)
            }
            await loader.load()
        }
    }
}

private struct ProposalCard: View {
    let proposal: Proposal
    let canModerate: Bool
    let act: (@escaping @Sendable () async throws -> String) -> Void

    @State private var confirmingRemove = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(proposal.title).displayStyle(18).foregroundStyle(Theme.paper)
                Spacer()
                StatusPill(status: proposal.status)
            }
            Text("Proposed by \(proposal.proposerName)").font(.caption).foregroundStyle(Theme.muted)
            if !proposal.body.isEmpty { Text(proposal.body).font(.subheadline) }

            Tally(proposal: proposal)

            if proposal.status == .open {
                HStack {
                    Image(systemName: "clock").font(.caption)
                    Text("Closes \(proposal.closesAt, style: .relative) from now").font(.caption)
                }
                .foregroundStyle(Theme.muted)

                HStack(spacing: 8) {
                    voteButton("Yes", inFavor: true)
                    voteButton("No", inFavor: false)
                    if proposal.myVote != nil {
                        Button("Clear") {
                            let id = proposal.id
                            act { try await API.write("DELETE", "proposals/\(id)/vote") }
                        }
                        .buttonStyle(.bordered)
                    }
                    Spacer()
                    if proposal.mine {
                        Button("Withdraw", role: .destructive) {
                            let id = proposal.id
                            act { try await API.write("POST", "proposals/\(id)/withdraw") }
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
        }
        .padding(.vertical, 6)
        .swipeActions {
            if canModerate {
                Button("Remove", role: .destructive) { confirmingRemove = true }
            }
        }
        .confirmationDialog("Remove “\(proposal.title)” and all its votes?", isPresented: $confirmingRemove, titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                let id = proposal.id
                act { try await API.write("DELETE", "proposals/\(id)") }
            }
        }
    }

    private func voteButton(_ label: String, inFavor: Bool) -> some View {
        let chosen = proposal.myVote == inFavor
        return Button {
            let id = proposal.id
            act { try await API.write("PUT", "proposals/\(id)/vote", ["inFavor": inFavor]) }
        } label: {
            Label(label, systemImage: inFavor ? "hand.thumbsup" : "hand.thumbsdown")
                .symbolVariant(chosen ? .fill : .none)
        }
        .buttonStyle(.borderedProminent)
        .tint(chosen ? Theme.accent : Theme.surface)
        .foregroundStyle(chosen ? Theme.ink : Theme.paper)
        .disabled(chosen)
        .accessibilityValue(chosen ? "Your vote" : "")
    }
}

/// Yes and No as a bar, with turnout against the quorum.
private struct Tally: View {
    let proposal: Proposal

    var body: some View {
        let votes = proposal.yes + proposal.no
        VStack(alignment: .leading, spacing: 4) {
            GeometryReader { geo in
                HStack(spacing: 2) {
                    if votes > 0 {
                        Rectangle().fill(Theme.accent).frame(width: geo.size.width * CGFloat(proposal.yes) / CGFloat(votes))
                        Rectangle().fill(Theme.muted)
                    } else {
                        Rectangle().fill(Theme.ink)
                    }
                }
            }
            .frame(height: 8)
            .clipShape(Capsule())
            HStack {
                Text("\(proposal.yes) yes · \(proposal.no) no").monospacedDigit()
                Spacer()
                Text("\(votes)/\(proposal.quorum) for quorum").monospacedDigit()
                    .foregroundStyle(votes >= proposal.quorum ? Theme.accent : Theme.muted)
            }
            .font(.caption)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct StatusPill: View {
    let status: ProposalStatus

    var body: some View {
        Text(status.label)
            .font(.caption2.weight(.bold)).textCase(.uppercase)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.2), in: Capsule())
            .foregroundStyle(color)
    }

    private var color: Color {
        switch status {
        case .open, .passed: Theme.accent
        case .rejected: .red
        case .withdrawn, .noQuorum: Theme.muted
        }
    }
}

private struct ProposalForm: View {
    let limits: ProposalsResponse.Limits?
    let onPosted: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var text = ""
    @State private var error: String?
    @State private var posting = false

    var body: some View {
        Form {
            Section {
                TextField("Title", text: $title)
                TextField("What are you proposing? (optional)", text: $text, axis: .vertical).lineLimit(4...12)
            } footer: {
                if let error { Text(error).foregroundStyle(.red) }
                else { Text("Voting stays open for a week. You can have \(limits?.maxOpen ?? 3) proposals open at once.") }
            }
            .listRowBackground(Theme.surface.opacity(0.45))
        }
        .screenBackground()
        .navigationTitle("New proposal")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Post") {
                    posting = true
                    Task {
                        defer { posting = false }
                        do { onPosted(try await API.write("POST", "proposals", ["title": title, "body": text])) }
                        catch { self.error = error.localizedDescription }
                    }
                }
                .disabled(posting || title.trimmingCharacters(in: .whitespaces).count < 3
                          || title.count > (limits?.maxTitle ?? 120) || text.count > (limits?.maxBody ?? 2000))
            }
        }
    }
}
