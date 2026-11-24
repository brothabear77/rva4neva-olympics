import SwiftUI

/// A one-line result of a write ("Profile saved.", or why it wasn't), shown as an alert.
struct Feedback: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let message: String

    static func success(_ message: String) -> Feedback { Feedback(title: "Done", message: message) }
    static func failure(_ error: Error) -> Feedback {
        Feedback(title: "Couldn't do that", message: error.localizedDescription)
    }
}

extension View {
    func feedbackAlert(_ feedback: Binding<Feedback?>) -> some View {
        alert(feedback.wrappedValue?.title ?? "", isPresented: Binding(
            get: { feedback.wrappedValue != nil },
            set: { if !$0 { feedback.wrappedValue = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(feedback.wrappedValue?.message ?? "")
        }
    }
}
