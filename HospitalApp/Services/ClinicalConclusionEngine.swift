import Foundation

final class ClinicalConclusionEngine {
    func buildConclusion(
        severityResult: SeverityResult,
        selectedSymptoms: [Symptom],
        vitals: Vitals,
        hadKnownAllergenContact: Bool? = nil
    ) -> ClinicalConclusionResult {
        let subgrades = severityResult.perSystemSubgrades
        let activeSystems = subgrades.filter { $0.value != .none }.map { $0.key }
        let grade = severityResult.severityGrade

        let primary = evaluatePrimaryVariant(
            severityGrade: grade,
            activeSystems: activeSystems,
            subgrades: subgrades,
            vitals: vitals
        )

        let niaid = evaluateNIAIDVariant(
            activeSystems: activeSystems,
            vitals: vitals,
            hadKnownAllergenContact: hadKnownAllergenContact
        )

        let wao = DiagnosisCheckResult(
            title: "Анафилаксия (вариант 3, WAO 2020)",
            status: .notEnoughData,
            reason: "Логика WAO 2020 подготовлена как задел для следующей итерации."
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
            urticariaAngioedemaText: urticariaAngioedema
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

    private func evaluatePrimaryVariant(
        severityGrade: Int,
        activeSystems: [SystemType],
        subgrades: [SystemType: Subgrade],
        vitals: Vitals
    ) -> DiagnosisCheckResult {
        let involvedCount = activeSystems.count
        let respiratorySubgrade = subgrades[.respiratory] ?? .none
        let hasIsolatedHypotension = vitals.isHypotension
            && (subgrades[.cardiovascular] ?? .none) != .none
            && activeSystems.filter { $0 != .cardiovascular }.isEmpty

        let respiratoryCritical = respiratorySubgrade == .severe || respiratorySubgrade == .moderate

        let confirmed = severityGrade >= 4
            || (severityGrade == 3 && involvedCount >= 2)
            || hasIsolatedHypotension
            || respiratoryCritical

        let reason: String
        if confirmed {
            var reasons: [String] = []
            if severityGrade >= 4 {
                reasons.append("ОАР \(severityGrade) степени")
            }
            if severityGrade == 3 && involvedCount >= 2 {
                reasons.append("ОАР 3 степени и ≥2 систем")
            }
            if hasIsolatedHypotension {
                reasons.append("изолированная гипотензия")
            }
            if respiratoryCritical {
                reasons.append("респираторная система: \(respiratorySubgrade.shortName)")
            }
            reason = reasons.joined(separator: "; ")
        } else {
            reason = "Критерии варианта 1 не выполнены."
        }

        return DiagnosisCheckResult(
            title: "Анафилаксия (вариант 1, основной)",
            status: confirmed ? .confirmed : .notConfirmed,
            reason: reason
        )
    }

    private func evaluateNIAIDVariant(
        activeSystems: [SystemType],
        vitals: Vitals,
        hadKnownAllergenContact: Bool?
    ) -> DiagnosisCheckResult {
        let hasSkinOrMucous = activeSystems.contains(.skin) || activeSystems.contains(.mucous)
        let hasResp = activeSystems.contains(.respiratory)
        let hasCV = activeSystems.contains(.cardiovascular) || vitals.isHypotension
        let hasGastro = activeSystems.contains(.gastrointestinal)

        let criterion1 = hasSkinOrMucous && (hasResp || hasCV)

        let symptomCategoryCount = [hasSkinOrMucous, hasResp, vitals.isHypotension, hasGastro]
            .filter { $0 }.count
        let criterion2 = (hadKnownAllergenContact == true) && symptomCategoryCount >= 2
        let criterion3 = (hadKnownAllergenContact == true) && vitals.isHypotension

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
                reason: "Нет данных о контакте с вероятным аллергеном."
            )
        }

        return DiagnosisCheckResult(
            title: "Анафилаксия (вариант 2, NIAID/FAAN 2005)",
            status: .notConfirmed,
            reason: "Критерии варианта 2 не выполнены."
        )
    }

    private func buildUrticariaAngioedemaText(
        severityGrade: Int,
        selectedSymptoms: [Symptom]
    ) -> String? {
        guard (1...2).contains(severityGrade) else { return nil }

        let skinOrMucous = selectedSymptoms.filter { $0.system == .skin || $0.system == .mucous }
        guard !skinOrMucous.isEmpty else { return nil }

        let names = Array(Set(skinOrMucous.map { $0.name })).sorted()

        if names.contains(where: { $0.localizedCaseInsensitiveContains("крапив") }) {
            return "крапивница"
        }

        let edema = names.filter {
            $0.localizedCaseInsensitiveContains("отек") ||
            $0.localizedCaseInsensitiveContains("ангио")
        }
        if !edema.isEmpty {
            return "ангиоотёк: " + edema.joined(separator: ", ")
        }

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
                return "ОАР 5 степени (тяжёлая анафилаксия – \(systemNames))"
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
        urticariaAngioedemaText: String?
    ) -> String {
        var lines: [String] = []
        lines.append("\(primary.title): \(primary.status.rawValue). \(primary.reason)")
        lines.append("\(niaid.title): \(niaid.status.rawValue). \(niaid.reason)")
        lines.append("\(wao.title): \(wao.status.rawValue). \(wao.reason)")
        if let urticariaAngioedemaText {
            lines.append("Крапивница/ангиоотёк: \(urticariaAngioedemaText).")
        }
        return lines.joined(separator: "\n")
    }
}
