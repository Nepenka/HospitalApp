import Foundation

enum DiagnosisStatus: String, Codable {
    case confirmed = "Подтверждена"
    case notConfirmed = "Не подтверждена"
    case notEnoughData = "Недостаточно данных"
}

struct DiagnosisCheckResult: Codable {
    let title: String
    let status: DiagnosisStatus
    let reason: String
}

struct ClinicalConclusionResult: Codable {
    let primaryAnaphylaxis: DiagnosisCheckResult
    let niaidAnaphylaxis: DiagnosisCheckResult
    let waoAnaphylaxis: DiagnosisCheckResult
    let urticariaAngioedemaText: String?
    let conclusionText: String
    let detailsText: String
}
