//
//  ExaminationsHistoryViewModel.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 17/02/2026.
//

import Foundation
import Combine

class ExaminationViewModel {
    @Published var examinations: [Examination] = []
    
    private let repository: ExaminationRepositoryProtocol
    
    init(repository: ExaminationRepositoryProtocol = ExaminationRepository()) {
        self.repository = repository
        loadExaminations()
    }
    
    func loadExaminations() {
        examinations = repository.getAllExaminations()
    }
    
    func deleteExamination(at index: Int) {
        guard index < examinations.count else { return }
        let exam = examinations[index]
        repository.deleteExamination(id: exam.id)
        loadExaminations()
    }
}
