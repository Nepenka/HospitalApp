//
//  ExaminationsHistoryViewModel.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 17/02/2026.
//

import Foundation
import Combine

class ExaminationViewModel {
    @Published private(set) var examinations: [Examination] = []
    @Published var searchText: String = ""
    
    private var allExaminations: [Examination] = []
    private let repository: ExaminationRepositoryProtocol
    private var cancellables = Set<AnyCancellable>()
    
    private let dateTimeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "dd.MM.yyyy HH:mm"
        f.locale = Locale(identifier: "ru_RU")
        return f
    }()
    
    private let dateOnlyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "dd.MM.yyyy"
        f.locale = Locale(identifier: "ru_RU")
        return f
    }()
    
    init(repository: ExaminationRepositoryProtocol = ExaminationRepository()) {
        self.repository = repository
        loadExaminations()
        
        $searchText
            .debounce(for: .milliseconds(200), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.applyFilter()
            }
            .store(in: &cancellables)
    }
    
    func loadExaminations() {
        allExaminations = repository.getAllExaminations()
        applyFilter()
    }
    
    func applyFilter() {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else {
            examinations = allExaminations
            return
        }
        let qLower = q.lowercased()
        examinations = allExaminations.filter { exam in
            if exam.patient.fullName.lowercased().contains(qLower) {
                return true
            }
            let dateTimeString = dateTimeFormatter.string(from: exam.date)
            let dateString = dateOnlyFormatter.string(from: exam.date)
            if dateTimeString.contains(q) || dateString.contains(q) {
                return true
            }
            return false
        }
    }
    
    func deleteExamination(id: UUID) {
        repository.deleteExamination(id: id)
        loadExaminations()
    }
    
    func deleteExamination(at index: Int) {
        guard index < examinations.count else { return }
        deleteExamination(id: examinations[index].id)
    }
}
