import Foundation

/// Справочник ключевых слов симптомов для критериев NIAID / WAO.
enum AnaphylaxisSymptomCatalog {
    static let skinMucousKeywords = [
        "крапив", "зуд", "эритем", "гиперем", "отек губ", "отек языка",
        "отек гортан", "отек век", "конъюнктивит", "ринорея", "слизист"
    ]

    static let respiratoryKeywords = [
        "одышк", "хрип", "бронхоспазм", "стридор", "гипокс", "сатурац", "spo2",
        "затруднен", "дыхан", "кашель", "дисфони", "лающ"
    ]

    static let cardiovascularKeywords = [
        "гипотенз", "коллапс", "обморок", "недержание мочи", "недержание кала",
        "тахикард", "брадикард", "остановка сердца", "шок", "слабость", "вялость",
        "головокруж", "предобмор"
    ]

    static let gastrointestinalKeywords = [
        "рвот", "диаре", "тошнот", "боль в живот", "абдомин", "метеоризм",
        "отхаркиван", "икота"
    ]

    static let urticariaKeywords = ["крапив"]
    static let angioedemaKeywords = ["отек губ", "отек век", "отек языка", "ангио", "отек гортан"]

    static func matchesAny(_ symptoms: [Symptom], keywords: [String]) -> Bool {
        let names = symptoms.map { $0.name.lowercased() }
        return names.contains { name in
            keywords.contains { name.contains($0) }
        }
    }

    static func matchedNames(_ symptoms: [Symptom], keywords: [String]) -> [String] {
        symptoms
            .map(\.name)
            .filter { name in
                let lower = name.lowercased()
                return keywords.contains { lower.contains($0) }
            }
    }
}
