import Foundation

final class ClinicalConclusionEngine {

    func buildConclusion(
        severityResult: SeverityResult,
        selectedSymptoms: [Symptom],
        vitals: Vitals,
        hadKnownAllergenContact: Bool? = nil
    ) -> ClinicalConclusionResult {
        let allergenContact = hadKnownAllergenContact ?? vitals.inferredAllergenContact
        let subgrades = severityResult.perSystemSubgrades
        let activeSystems = subgrades.filter { $0.value != .none }.map { $0.key }
        let grade = severityResult.severityGrade

        let primary = evaluatePrimaryVariant(
            severityGrade: grade,
            activeSystems: activeSystems,
            subgrades: subgrades,
            vitals: vitals,
            selectedSymptoms: selectedSymptoms
        )

        let niaid = evaluateNIAIDVariant(
            selectedSymptoms: selectedSymptoms,
            vitals: vitals,
            hadKnownAllergenContact: allergenContact
        )

        let wao = evaluateWAOVariant(
            selectedSymptoms: selectedSymptoms,
            vitals: vitals
        )

        let urticariaAngioedema = buildUrticariaAngioedemaText(
            severityGrade: grade,
            selectedSymptoms: selectedSymptoms
        )

        let conclusionText = buildConclusionText(
            severityGrade: grade,
            activeSystems: activeSystems,
            primary: primary,
            urticariaAngioedemaText: urticariaAngioedema
        )

        let detailsText = buildDetailsText(
            primary: primary,
            niaid: niaid,
            wao: wao,
            urticariaAngioedemaText: urticariaAngioedema,
            probableAllergen: vitals.probableAllergen
        )

        return ClinicalConclusionResult(
            primaryAnaphylaxis: primary,
            niaidAnaphylaxis: niaid,
            waoAnaphylaxis: wao,
            urticariaAngioedemaText: urticariaAngioedema,
            conclusionText: conclusionText,
            detailsText: detailsText
        )
    }

    // MARK: - Variant 1 (основной)

    private func evaluatePrimaryVariant(
        severityGrade: Int,
        activeSystems: [SystemType],
        subgrades: [SystemType: Subgrade],
        vitals: Vitals,
        selectedSymptoms: [Symptom]
    ) -> DiagnosisCheckResult {
        let involvedCount = activeSystems.count
        let respiratorySubgrade = subgrades[.respiratory] ?? .none

        let hasIsolatedHypotension = vitals.isHypotension
            && activeSystems.contains(.cardiovascular)
            && activeSystems.filter { $0 != .cardiovascular }.isEmpty

        // В приложении субградации Л/У/Т: для «>= умеренной» используем У или Т.
        let respiratorySignificant = respiratorySubgrade == .moderate || respiratorySubgrade == .severe
        let hasRespiratorySymptoms = activeSystems.contains(.respiratory)
            || AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.respiratoryKeywords)

        let confirmed = severityGrade >= 4
            || (severityGrade == 3 && involvedCount >= 2)
            || hasIsolatedHypotension
            || (hasRespiratorySymptoms && respiratorySignificant)

        let reason: String
        if confirmed {
            var reasons: [String] = []
            if severityGrade >= 4 { reasons.append("ОАР \(severityGrade) степени") }
            if severityGrade == 3 && involvedCount >= 2 { reasons.append("ОАР 3 и ≥2 систем") }
            if hasIsolatedHypotension { reasons.append("изолированная гипотензия") }
            if hasRespiratorySymptoms && respiratorySignificant {
                reasons.append("респираторная система: \(respiratorySubgrade.shortName)")
            }
            reason = reasons.isEmpty ? "Критерии выполнены." : reasons.joined(separator: "; ")
        } else {
            reason = "Критерии варианта 1 не выполнены."
        }

        return DiagnosisCheckResult(
            title: "Анафилаксия (вариант 1, основной)",
            status: confirmed ? .confirmed : .notConfirmed,
            reason: reason
        )
    }

    // MARK: - Variant 2 (NIAID/FAAN 2005)

    private func evaluateNIAIDVariant(
        selectedSymptoms: [Symptom],
        vitals: Vitals,
        hadKnownAllergenContact: Bool?
    ) -> DiagnosisCheckResult {
        let hasSkin = AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.skinMucousKeywords)
        let hasResp = AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.respiratoryKeywords)
        let hasCV = AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.cardiovascularKeywords)
            || vitals.isHypotension
        let hasGI = AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.gastrointestinalKeywords)

        let criterion1 = hasSkin && (hasResp || hasCV)

        let categories = [hasSkin, hasResp, vitals.isHypotension, hasGI].filter { $0 }.count
        let criterion2 = (hadKnownAllergenContact == true) && categories >= 2

        let criterion3 = (hadKnownAllergenContact == true) && isNIAIDHypotension(vitals: vitals)

        if criterion1 || criterion2 || criterion3 {
            let triggered = [
                criterion1 ? "Критерий 1" : nil,
                criterion2 ? "Критерий 2" : nil,
                criterion3 ? "Критерий 3" : nil
            ].compactMap { $0 }.joined(separator: ", ")

            return DiagnosisCheckResult(
                title: "Анафилаксия (вариант 2, NIAID/FAAN 2005)",
                status: .confirmed,
                reason: "Выполнено: \(triggered)."
            )
        }

        if hadKnownAllergenContact == nil && !criterion1 {
            return DiagnosisCheckResult(
                title: "Анафилаксия (вариант 2, NIAID/FAAN 2005)",
                status: .notEnoughData,
                reason: "Контакт с аллергеном не указан — критерии 2 и 3 не оцениваются."
            )
        }

        return DiagnosisCheckResult(
            title: "Анафилаксия (вариант 2, NIAID/FAAN 2005)",
            status: .notConfirmed,
            reason: "Критерии варианта 2 не выполнены."
        )
    }

    private func isNIAIDHypotension(vitals: Vitals) -> Bool {
        guard let sbp = vitals.systolicBP, let age = vitals.patientAge else { return vitals.isHypotension }

        if age.isAdult {
            if sbp < 90 { return true }
            if let baseline = vitals.baselineSystolicBP, baseline > 0 {
                return Double(sbp) < Double(baseline) * 0.7
            }
            return false
        }

        let threshold: Int
        switch age.ageInYears {
        case ..<1: threshold = 70
        case 1...10: threshold = 70 + (2 * age.ageInYears)
        default: threshold = 90
        }
        return sbp < threshold
    }

    // MARK: - Variant 3 (WAO 2020)

    private func evaluateWAOVariant(
        selectedSymptoms: [Symptom],
        vitals: Vitals
    ) -> DiagnosisCheckResult {
        let hasSkin = AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.skinMucousKeywords)
        let hasResp = AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.respiratoryKeywords)
        let hasCV = AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.cardiovascularKeywords)
        let hasGI = AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.gastrointestinalKeywords)

        let criterion1 = hasSkin && (hasResp || hasCV || hasGI)
        let criterion2 = isWAOHypotension(vitals: vitals) || hasResp

        if criterion1 || criterion2 {
            var parts: [String] = []
            if criterion1 { parts.append("Критерий 1") }
            if criterion2 {
                if isWAOHypotension(vitals: vitals) { parts.append("снижение САД") }
                if hasResp { parts.append("респираторные нарушения") }
            }
            return DiagnosisCheckResult(
                title: "Анафилаксия (вариант 3, WAO 2020)",
                status: .confirmed,
                reason: "Выполнено: \(parts.joined(separator: ", "))."
            )
        }

        return DiagnosisCheckResult(
            title: "Анафилаксия (вариант 3, WAO 2020)",
            status: .notConfirmed,
            reason: "Критерии WAO 2020 не выполнены."
        )
    }

    private func isWAOHypotension(vitals: Vitals) -> Bool {
        guard let sbp = vitals.systolicBP, let age = vitals.patientAge else { return vitals.isHypotension }

        if let baseline = vitals.baselineSystolicBP, baseline > 0 {
            if Double(sbp) < Double(baseline) * 0.7 { return true }
        }

        if age.ageInYears <= 10 {
            let threshold = 70 + (2 * age.ageInYears)
            return sbp < threshold
        }
        return sbp < 90
    }

    // MARK: - Заключение

    private func buildUrticariaAngioedemaText(
        severityGrade: Int,
        selectedSymptoms: [Symptom]
    ) -> String? {
        guard (1...2).contains(severityGrade) else { return nil }
        guard AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.skinMucousKeywords) else {
            return nil
        }

        if AnaphylaxisSymptomCatalog.matchesAny(selectedSymptoms, keywords: AnaphylaxisSymptomCatalog.urticariaKeywords) {
            return "крапивница"
        }

        let edema = AnaphylaxisSymptomCatalog.matchedNames(
            selectedSymptoms,
            keywords: AnaphylaxisSymptomCatalog.angioedemaKeywords
        )
        if !edema.isEmpty {
            return "ангиоотёк: " + edema.joined(separator: ", ")
        }

        let names = AnaphylaxisSymptomCatalog.matchedNames(
            selectedSymptoms,
            keywords: AnaphylaxisSymptomCatalog.skinMucousKeywords
        )
        return "кожно-слизистые проявления: " + names.joined(separator: ", ")
    }

    private func buildConclusionText(
        severityGrade: Int,
        activeSystems: [SystemType],
        primary: DiagnosisCheckResult,
        urticariaAngioedemaText: String?
    ) -> String {
        let systemNames = activeSystems.map(\.displayName).sorted().joined(separator: ", ").lowercased()

        if primary.status == .confirmed {
            switch severityGrade {
            case 3:
                return "ОАР 3 степени (анафилаксия лёгкой степени – \(systemNames))"
            case 4:
                return "ОАР 4 степени (анафилаксия средней степени – \(systemNames))"
            case 5:
                return "ОАР 5 степени (тяжёлая анафилаксия / анафилактический шок – \(systemNames))"
            default:
                return "ОАР \(severityGrade) степени (анафилаксия – \(systemNames))"
            }
        }

        if let urticariaAngioedemaText {
            return "ОАР \(severityGrade) степени (\(urticariaAngioedemaText))"
        }

        return "ОАР \(severityGrade) степени"
    }

    private func buildDetailsText(
        primary: DiagnosisCheckResult,
        niaid: DiagnosisCheckResult,
        wao: DiagnosisCheckResult,
        urticariaAngioedemaText: String?,
        probableAllergen: String?
    ) -> String {
        var lines: [String] = []
        if let allergen = probableAllergen?.trimmingCharacters(in: .whitespacesAndNewlines), !allergen.isEmpty {
            lines.append("Вероятный аллерген: \(allergen)")
        } else {
            lines.append("Вероятный аллерген: не указан")
        }
        lines.append("\(primary.title): \(primary.status.rawValue). \(primary.reason)")
        lines.append("\(niaid.title): \(niaid.status.rawValue). \(niaid.reason)")
        lines.append("\(wao.title): \(wao.status.rawValue). \(wao.reason)")
        if let urticariaAngioedemaText {
            lines.append("Крапивница/ангиоотёк: \(urticariaAngioedemaText)")
        }
        return lines.joined(separator: "\n")
    }
}

private extension Vitals {
    /// true — аллерген указан; nil — не указан (не ошибка).
    var inferredAllergenContact: Bool? {
        guard let value = probableAllergen?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        return true
    }
}
