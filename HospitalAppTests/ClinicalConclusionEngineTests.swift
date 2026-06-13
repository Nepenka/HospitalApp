import XCTest
@testable import HospitalApp

final class ClinicalConclusionEngineTests: XCTestCase {
    private let engine = ClinicalConclusionEngine()

    func testEmptyAllergenDoesNotCrashAndNIAIDNotEnoughData() {
        let symptoms = [symptom("Тошнота", system: .gastrointestinal)]
        let vitals = makeVitals(allergen: nil)
        let severity = makeSeverity(grade: 2, subgrades: [.gastrointestinal: .light])

        let result = engine.buildConclusion(
            severityResult: severity,
            selectedSymptoms: symptoms,
            vitals: vitals
        )

        XCTAssertEqual(result.niaidAnaphylaxis.status, .notEnoughData)
        XCTAssertTrue(result.detailsText.contains("не указано"))
    }

    func testFilledAllergenEnablesNIAIDCriterion2() {
        let symptoms = [
            symptom("Крапивница", system: .skin),
            symptom("Одышка", system: .respiratory)
        ]
        var vitals = makeVitals(allergen: "Арахис")
        vitals.systolicBP = 120
        vitals.diastolicBP = 80
        vitals.spO2 = 98
        vitals.heartRate = 80
        vitals.respiratoryRate = 16
        vitals.gcs = 15
        vitals.ageYears = 30

        let severity = makeSeverity(grade: 2, subgrades: [.skin: .light, .respiratory: .light])
        let result = engine.buildConclusion(
            severityResult: severity,
            selectedSymptoms: symptoms,
            vitals: vitals
        )

        XCTAssertEqual(result.niaidAnaphylaxis.status, .confirmed)
        XCTAssertTrue(result.niaidAnaphylaxis.reason.contains("Критерий 2"))
    }

    func testPrimaryVariantOAR4ConfirmsAnaphylaxis() {
        let severity = makeSeverity(
            grade: 4,
            subgrades: [.skin: .moderate, .respiratory: .moderate]
        )
        let result = engine.buildConclusion(
            severityResult: severity,
            selectedSymptoms: [],
            vitals: makeVitals()
        )

        XCTAssertEqual(result.primaryAnaphylaxis.status, .confirmed)
        XCTAssertTrue(result.conclusionText.contains("анафилаксия среднетяжелой"))
    }

    func testWAOCriterion1SkinAndGI() {
        let symptoms = [
            symptom("Крапивница", system: .skin),
            symptom("Рвота", system: .gastrointestinal, subgrade: .moderate)
        ]
        let result = engine.buildConclusion(
            severityResult: makeSeverity(grade: 2, subgrades: [.skin: .light, .gastrointestinal: .moderate]),
            selectedSymptoms: symptoms,
            vitals: makeVitals()
        )

        XCTAssertEqual(result.waoAnaphylaxis.status, .confirmed)
        XCTAssertTrue(result.waoAnaphylaxis.reason.contains("Критерий 1"))
    }

    func testUrticariaTextForOAR1() {
        let symptoms = [symptom("Крапивница", system: .skin)]
        let result = engine.buildConclusion(
            severityResult: makeSeverity(grade: 1, subgrades: [.skin: .light]),
            selectedSymptoms: symptoms,
            vitals: makeVitals()
        )

        XCTAssertEqual(result.primaryAnaphylaxis.status, .notConfirmed)
        XCTAssertEqual(result.urticariaAngioedemaText, "крапивница")
        XCTAssertTrue(result.conclusionText.contains("крапивница"))
    }

    func testWAOCriterion2RequiresAllergenExposure() {
        let symptoms = [symptom("Одышка", system: .respiratory)]
        let result = engine.buildConclusion(
            severityResult: makeSeverity(grade: 2, subgrades: [.respiratory: .light]),
            selectedSymptoms: symptoms,
            vitals: makeVitals(allergen: nil)
        )

        XCTAssertNotEqual(result.waoAnaphylaxis.status, .confirmed)
        XCTAssertEqual(result.waoAnaphylaxis.status, .notEnoughData)
    }

    func testWAOCriterion2WithAllergenAndRespiratory() {
        let symptoms = [symptom("Одышка", system: .respiratory)]
        let result = engine.buildConclusion(
            severityResult: makeSeverity(grade: 2, subgrades: [.respiratory: .light]),
            selectedSymptoms: symptoms,
            vitals: makeVitals(allergen: "Пенициллин")
        )

        XCTAssertEqual(result.waoAnaphylaxis.status, .confirmed)
        XCTAssertTrue(result.waoAnaphylaxis.reason.contains("Критерий 2"))
    }

    func testNIAIDCriterion2CountsOnlyModerateGI() {
        let symptoms = [
            symptom("Крапивница", system: .skin),
            symptom("Тошнота", system: .gastrointestinal, subgrade: .light)
        ]
        let result = engine.buildConclusion(
            severityResult: makeSeverity(grade: 2, subgrades: [.skin: .light, .gastrointestinal: .light]),
            selectedSymptoms: symptoms,
            vitals: makeVitals(allergen: "Молоко")
        )

        XCTAssertNotEqual(result.niaidAnaphylaxis.status, .confirmed)
    }

    func testNIAIDConfirmedByVariantUsesCurrentOARGradeInConclusion() {
        let symptoms = [
            symptom("Крапивница", system: .skin),
            symptom("Одышка", system: .respiratory)
        ]
        let result = engine.buildConclusion(
            severityResult: makeSeverity(grade: 2, subgrades: [.skin: .light, .respiratory: .light]),
            selectedSymptoms: symptoms,
            vitals: makeVitals(allergen: "Арахис")
        )

        XCTAssertEqual(result.niaidAnaphylaxis.status, .confirmed)
        XCTAssertTrue(result.conclusionText.contains("ОАР 2 степени тяжести"))
        XCTAssertTrue(result.conclusionText.contains("анафилаксия"))
        XCTAssertFalse(result.conclusionText.contains("лёгкой степени"))
    }

    // MARK: - Helpers

    private func symptom(_ name: String, system: SystemType, subgrade: Subgrade = .light) -> Symptom {
        Symptom(name: name, system: system, defaultSubgradeHint: subgrade, isSelected: true)
    }

    private func makeSeverity(grade: Int, subgrades: [SystemType: Subgrade]) -> SeverityResult {
        SeverityResult(
            severityGrade: grade,
            perSystemSubgrades: subgrades,
            explanation: "test"
        )
    }

    private func makeVitals(allergen: String? = nil) -> Vitals {
        Vitals(
            ageYears: 25,
            ageMonths: nil,
            baselineSystolicBP: nil,
            systolicBP: 120,
            diastolicBP: 80,
            spO2: 98,
            heartRate: 80,
            respiratoryRate: 16,
            gcs: 15,
            probableAllergen: allergen
        )
    }
}
