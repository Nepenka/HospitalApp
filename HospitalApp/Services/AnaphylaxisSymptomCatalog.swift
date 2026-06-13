import Foundation

/// Справочник ключевых слов симптомов для критериев NIAID / WAO.
enum AnaphylaxisSymptomCatalog {
    // MARK: - NIAID/FAAN 2005 (критерий 1)

    static let niaidSkinMucousKeywords = [
        "крапив", "зуд", "эритем", "гиперем", "отек губ", "отек языка", "отек гортан"
    ]

    static let niaidRespiratoryKeywords = [
        "одышк", "хрип", "свистящ", "бронхоспазм", "стридор", "гипокс", "sao2", "spo2"
    ]

    static let urinaryIncontinenceKeywords = ["недержание мочи"]

    // MARK: - WAO 2020

    static let waoSkinMucousKeywords = [
        "крапив", "зуд", "эритем", "гиперем", "отек губ", "отек языка", "отек гортан", "отек язычк"
    ]

    static let waoRespiratoryKeywords = [
        "одышк", "хрип", "свистящ", "бронхоспазм", "стридор", "гипокс", "гипоксем", "sao2", "spo2"
    ]

    static let waoCardiovascularKeywords = ["обморок", "недержание мочи"]

    static let waoGIModerateKeywords = [
        "рвот", "боль в живот", "абдомин", "диаре"
    ]

    // MARK: - Заключение (ОАР 1–2)

    static let skinMucousKeywords = [
        "крапив", "зуд", "эритем", "гиперем", "отек губ", "отек языка",
        "отек гортан", "отек век", "конъюнктивит", "ринорея", "слизист"
    ]

    static let urticariaKeywords = ["крапив"]
    static let angioedemaKeywords = ["отек губ", "отек век", "отек языка", "ангио", "отек гортан"]

    // MARK: - Matching

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

    /// ЖКТ-симптомы умеренной или тяжёлой субградации (для NIAID крит. 2 и WAO крит. 1).
    static func hasModerateOrSevereGISymptoms(_ symptoms: [Symptom]) -> Bool {
        symptoms.contains { symptom in
            symptom.system == .gastrointestinal
                && (symptom.effectiveSubgrade == .moderate || symptom.effectiveSubgrade == .severe)
        }
    }

    static func hasUrinaryIncontinence(_ symptoms: [Symptom]) -> Bool {
        matchesAny(symptoms, keywords: urinaryIncontinenceKeywords)
    }
}
