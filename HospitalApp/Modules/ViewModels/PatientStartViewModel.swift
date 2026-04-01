import Foundation
import Combine

class PatientStartViewModel {
    @Published var fullName: String = ""
    @Published var preliminaryDiagnosis: String = ""
    @Published private(set) var isValid: Bool = false
    
    private let repository: PatientRepositoryProtocol
    private var cancellables = Set<AnyCancellable>()
    
    init(repository: PatientRepositoryProtocol = PatientRepository()) {
        self.repository = repository
        setupValidation()
    }
    
    private func setupValidation() {
        Publishers.CombineLatest($fullName, $preliminaryDiagnosis)
            .map { fullName, preliminaryDiagnosis in
                !fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                !preliminaryDiagnosis.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            .assign(to: &$isValid)
    }
    
    func createAndSavePatient() -> Patient? {
        let cleanFullName = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanDiagnosis = preliminaryDiagnosis.trimmingCharacters(in: .whitespacesAndNewlines)
        
        guard !cleanFullName.isEmpty, !cleanDiagnosis.isEmpty else {
            return nil
        }
        
        let parts = cleanFullName
            .split(separator: " ")
            .map { String($0) }
            .filter { !$0.isEmpty }
        
        let lastName = parts.indices.contains(0) ? parts[0] : cleanFullName
        let firstName = parts.indices.contains(1) ? parts[1] : "-"
        let middleName = parts.indices.contains(2) ? parts[2] : "-"
        
        let patient = Patient(
            firstName: firstName,
            lastName: lastName,
            middleName: middleName
        )
        repository.savePatient(patient)
        return patient
    }
}
