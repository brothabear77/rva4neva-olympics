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

/// The site's typefaces (src/app/layout.tsx): Oswald for display, Geist for text. Bundled as
/// static weights in Resources/Fonts (the variable fonts' default instance is hairline-thin,
/// and CoreText won't move a variable font's weight axis for a SwiftUI .weight()).
enum AppFont {
    static func oswald(_ weight: Font.Weight) -> String {
        switch weight {
        case .bold, .heavy, .black: "Oswald-Bold"
        case .semibold: "Oswald-SemiBold"
        default: "Oswald-Medium"
        }
    }

    static func geist(_ weight: Font.Weight) -> String {
        switch weight {
        case .bold, .heavy, .black: "Geist-Bold"
        case .semibold: "Geist-SemiBold"
        case .medium: "Geist-Medium"
        default: "Geist-Regular"
        }
    }

    /// iOS's default point size for each text style, at the standard Dynamic Type setting.
    static func size(_ style: Font.TextStyle) -> CGFloat {
        switch style {
        case .largeTitle: 34
        case .title: 28
        case .title2: 22
        case .title3: 20
        case .headline, .body: 17
        case .callout: 16
        case .subheadline: 15
        case .footnote: 13
        case .caption: 12
        case .caption2: 11
        @unknown default: 17
        }
    }

    /// The text style a fixed size scales with, so custom sizes still follow Dynamic Type.
    static func style(near size: CGFloat) -> Font.TextStyle {
        switch size {
        case ..<13: .caption
        case ..<15: .footnote
        case ..<17: .subheadline
        case ..<20: .body
        case ..<22: .title3
        case ..<28: .title2
        case ..<34: .title
        default: .largeTitle
        }
    }
}

extension Font {
    /// Oswald, the site's display face: headings and names, set in capitals by displayStyle().
    static func display(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .custom(AppFont.oswald(weight), size: size, relativeTo: AppFont.style(near: size))
    }

    /// Big numbers: points, ranks, the countdown. Geist Bold rather than Oswald, because
    /// Oswald's digits differ in width (a "1" is 30% narrower than a "0"), so a ticking
    /// countdown or a column of points would jitter. Geist has tabular figures.
    static func number(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .custom(AppFont.geist(weight), size: size, relativeTo: AppFont.style(near: size)).monospacedDigit()
    }

    /// Geist at a text style's size, scaling with Dynamic Type like the system styles.
    static func geist(_ style: Font.TextStyle, weight: Font.Weight? = nil) -> Font {
        .custom(AppFont.geist(weight ?? (style == .headline ? .semibold : .regular)),
                size: AppFont.size(style), relativeTo: style)
    }
}

extension View {
    /// Headings the way the site sets them: condensed capitals with a little tracking.
    func displayStyle(_ size: CGFloat = 22, weight: Font.Weight = .bold) -> some View {
        font(.display(size, weight: weight)).textCase(.uppercase).tracking(0.8)
    }

    /// Small gold caps above a title ("Overall standings").
    func eyebrowStyle() -> some View {
        font(.geist(.caption, weight: .semibold)).textCase(.uppercase).tracking(1.5).foregroundStyle(Theme.accent)
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
