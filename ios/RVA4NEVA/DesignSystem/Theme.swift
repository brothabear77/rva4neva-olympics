import SwiftUI

/// The site's palette (src/app/globals.css @theme): a dark, five-colour scheme.
enum Theme {
    static let ink = Color(hex: 0x14110F)      // background
    static let surface = Color(hex: 0x34312D)  // cards
    static let muted = Color(hex: 0x7E7F83)    // secondary text
    static let paper = Color(hex: 0xF3F3F4)    // primary text
    static let accent = Color(hex: 0xDDC53B)   // gold
    static let edge = Color.white.opacity(0.08)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

extension Font {
    /// Stands in for Oswald, the site's display face: condensed, bold, set in capitals.
    static func display(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight).width(.condensed)
    }
}

extension View {
    /// Headings the way the site sets them: condensed capitals with a little tracking.
    func displayStyle(_ size: CGFloat = 22, weight: Font.Weight = .bold) -> some View {
        font(.display(size, weight: weight)).textCase(.uppercase).tracking(0.8)
    }

    /// Small gold caps above a title ("Overall standings").
    func eyebrowStyle() -> some View {
        font(.caption.weight(.semibold)).textCase(.uppercase).tracking(1.5).foregroundStyle(Theme.accent)
    }

    func card(padding: CGFloat = 16) -> some View {
        self.padding(padding)
            .background(Theme.surface.opacity(0.55), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.edge))
    }

    /// The app's screen background, behind lists and scroll views alike.
    func screenBackground() -> some View {
        scrollContentBackground(.hidden).background(Theme.ink.ignoresSafeArea())
    }
}
