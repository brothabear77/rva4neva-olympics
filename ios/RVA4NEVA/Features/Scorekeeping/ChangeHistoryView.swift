import SwiftUI

/// Every score ever added, changed or removed, and who did it. Append-only: Undo adds a
/// new entry rather than erasing anything.
struct ChangeHistoryView: View {
    @State private var page = 1
    @State private var response: ChangeLogResponse?
    @State private var error: String?
    @State private var feedback: Feedback?
    @State private var confirming: ChangeLogEntry?

    var body: some View {
        List {
            if let response {
                if response.locked {
                    Label("The scoreboard is locked: nothing can be restored right now.", systemImage: "lock.fill")
                        .font(.geist(.footnote)).listRowBackground(Color.red.opacity(0.2))
                }
                ForEach(response.entries) { entry in
                    EntryRow(entry: entry, canUndo: response.canRestore && !response.locked) { confirming = entry }
                }
                .listRowBackground(Theme.surface.opacity(0.45))

                if response.pageCount > 1 {
                    HStack {
                        Button { page -= 1 } label: { Image(systemName: "chevron.left") }.disabled(page <= 1)
                        Spacer()
                        Text("Page \(response.page) of \(response.pageCount) · \(response.total) changes").font(.geist(.caption)).foregroundStyle(Theme.muted)
                        Spacer()
                        Button { page += 1 } label: { Image(systemName: "chevron.right") }.disabled(page >= response.pageCount)
                    }
                    .buttonStyle(.borderless)
                    .listRowBackground(Color.clear)
                }
            } else if let error {
                ContentUnavailableView("Couldn't load the history", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
        }
        .screenBackground()
        .navigationTitle("Change History")
        .task(id: page) { await load() }
        .refreshable { await load() }
        .confirmationDialog(confirming?.undoText ?? "", isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
                            titleVisibility: .visible, presenting: confirming) { entry in
            Button(entry.undoText ?? "Undo") { undo(entry) }
        } message: { entry in
            Text(entry.label)
        }
        .feedbackAlert($feedback)
    }

    private func load() async {
        do {
            response = try await API.changelog(page: page)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func undo(_ entry: ChangeLogEntry) {
        Task {
            do {
                feedback = .success(try await API.write("POST", "changelog/\(entry.id)/restore"))
                page = 1
                await load()
            } catch {
                feedback = .failure(error)
            }
        }
    }
}

private struct EntryRow: View {
    let entry: ChangeLogEntry
    let canUndo: Bool
    let onUndo: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(entry.operationLabel).font(.geist(.caption, weight: .bold)).textCase(.uppercase)
                    .foregroundStyle(entry.operation == "DELETE" ? .red : Theme.accent)
                Text(entry.label).font(.geist(.subheadline, weight: .semibold))
                Spacer()
                Text("#\(entry.id)").font(.geist(.caption2).monospacedDigit()).foregroundStyle(Theme.muted)
            }
            ForEach(entry.changes, id: \.field) { change in
                HStack(spacing: 4) {
                    Text(change.field).foregroundStyle(Theme.muted)
                    if let old = change.old, entry.operation != "INSERT" { Text(old).strikethrough(change.new != nil) }
                    if change.old != nil && change.new != nil && entry.operation == "UPDATE" { Image(systemName: "arrow.right").font(.geist(.caption2)) }
                    if let new = change.new, entry.operation != "DELETE" { Text(new) }
                }
                .font(.geist(.caption).monospacedDigit())
            }
            Text("\(entry.changedBy) · \(entry.changedAt.formatted(date: .abbreviated, time: .shortened))\(entry.restoredFromId.map { " · from #\($0)" } ?? "")")
                .font(.geist(.caption2)).foregroundStyle(Theme.muted)
            if entry.removedWithAccount {
                Text("Removed with a deleted account").font(.geist(.caption2)).foregroundStyle(Theme.muted)
            }
            if canUndo, let text = entry.undoText {
                Button(text, action: onUndo)
                    .font(.geist(.caption, weight: .semibold))
                    .buttonStyle(.bordered)
                    .disabled(entry.unrecoverable)
            }
        }
        .padding(.vertical, 4)
    }
}
