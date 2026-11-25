import SwiftUI

/// Days, hours, minutes and seconds to kickoff, ticking every second. After kickoff it
/// says the games are on (or finished).
struct CountdownView: View {
    let startsAt: Date
    var finished = false
    var large = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = startsAt.timeIntervalSince(context.date)
            if remaining <= 0 {
                Text(finished ? "Games finished" : "The games are on")
                    .displayStyle(large ? 32 : 22)
                    .foregroundStyle(Theme.accent)
            } else {
                let parts = Self.parts(remaining)
                HStack(spacing: large ? 14 : 10) {
                    unit(parts.days, "Days")
                    unit(parts.hours, "Hrs")
                    unit(parts.minutes, "Min")
                    unit(parts.seconds, "Sec")
                }
                // Four big numbers side by side can only grow so far before they wrap.
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(parts.days) days, \(parts.hours) hours, \(parts.minutes) minutes until kickoff")
            }
        }
    }

    private func unit(_ value: Int, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value, format: .number.precision(.integerLength(2...)))
                .font(.number(large ? 44 : 30))
                .monospacedDigit()
                .foregroundStyle(Theme.paper)
                .contentTransition(.numericText(countsDown: true))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Text(label).eyebrowStyle().foregroundStyle(Theme.muted)
        }
        .frame(minWidth: large ? 64 : 48)
    }

    static func parts(_ interval: TimeInterval) -> (days: Int, hours: Int, minutes: Int, seconds: Int) {
        let total = max(0, Int(interval))
        return (total / 86_400, total % 86_400 / 3_600, total % 3_600 / 60, total % 60)
    }
}

/// The quotes, one at a time, each staying five seconds (src/lib/quotes.ts DWELL_MS).
struct QuoteCarousel: View {
    let quotes: [Quote]
    @State private var index = 0

    var body: some View {
        if !quotes.isEmpty {
            // The clip has to belong to a container that stays put. Clipping the quote itself
            // moves the clip along with it, so the outgoing quote stayed visible as it slid
            // out past the edge of the card.
            ZStack {
                QuoteText(quote: quotes[index % quotes.count])
                    .id(index)
                    .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                            removal: .move(edge: .leading).combined(with: .opacity)))
            }
            .frame(maxWidth: .infinity, minHeight: 120)
            .clipped()
            .contentShape(Rectangle())
            .onTapGesture { withAnimation { index += 1 } }
            .task(id: index) {
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled else { return }
                withAnimation(.easeInOut(duration: 0.4)) { index += 1 }
            }
        }
    }
}

private struct QuoteText: View {
    let quote: Quote

    var body: some View {
        VStack(spacing: 8) {
            Text("\u{201C}\(quote.text)\u{201D}")
                .font(.geist(.body).italic())
                .foregroundStyle(Theme.paper)
                .multilineTextAlignment(.center)
            if let author = quote.author {
                Text("— \(author)").font(.geist(.caption)).foregroundStyle(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity)
    }
}
