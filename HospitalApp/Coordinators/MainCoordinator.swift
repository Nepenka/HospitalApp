//
//  MainCoordinator.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import UIKit

class MainCoordinator: Coordinator {
    var navigationController: UINavigationController
    private var currentPatient: Patient?
    
    init(navigationController: UINavigationController) {
        self.navigationController = navigationController
    }
    
    func start() {
        let viewModel = PatientStartViewModel()
        let viewController = PatientStartViewController(viewModel: viewModel, coordinator: self)
        navigationController.pushViewController(viewController, animated: false)
    }
    
    func showSymptoms(
        for patient: Patient,
        initialSymptoms: [Symptom] = [],
        initialVitals: Vitals? = nil,
        initialDiagnosis: String? = nil,
        editingExaminationId: UUID? = nil
    ) {
        currentPatient = patient
        let viewModel = SymptomsViewModel(initialSelectedSymptoms: initialSymptoms)
        let viewController = SymptomsViewController(
            viewModel: viewModel,
            coordinator: self,
            initialVitals: initialVitals,
            initialDiagnosis: initialDiagnosis,
            editingExaminationId: editingExaminationId
        )
        navigationController.pushViewController(viewController, animated: true)
    }
    
    func showVitalsInput(
        selectedSymptoms: [Symptom],
        initialVitals: Vitals? = nil,
        initialDiagnosis: String? = nil,
        editingExaminationId: UUID? = nil
    ) {
        let viewModel = VitalsViewModel(initialVitals: initialVitals ?? Vitals())
        let viewController = VitalsViewController(
            viewModel: viewModel,
            selectedSymptoms: selectedSymptoms,
            coordinator: self,
            initialDiagnosis: initialDiagnosis,
            editingExaminationId: editingExaminationId
        )
        navigationController.pushViewController(viewController, animated: true)
    }
    
    func showResult(
        selectedSymptoms: [Symptom],
        vitals: Vitals,
        initialDiagnosis: String? = nil,
        editingExaminationId: UUID? = nil
    ) {
        guard let patient = currentPatient else { return }
        let viewModel = ResultViewModel()
        viewModel.calculateSeverity(
            selectedSymptoms: selectedSymptoms,
            vitals: vitals,
            patient: patient,
            initialDiagnosis: initialDiagnosis,
            editingExaminationId: editingExaminationId
        )
        let viewController = ResultViewController(viewModel: viewModel, coordinator: self)
        navigationController.pushViewController(viewController, animated: true)
    }
    
    func startNewExamination() {
        currentPatient = nil
        if let rootVC = navigationController.viewControllers.first as? PatientStartViewController {
            rootVC.reset()
        }
        navigationController.popToRootViewController(animated: true)
    }
    
    func showExaminationHistory() {
        let viewModel = ExaminationViewModel()
        let controller = ExaminationsHistoryViewController(viewModel: viewModel, coordinator: self)
        navigationController.pushViewController(controller, animated: true)
        
    }
    
    func editExamination(_ examination: Examination) {
        showSymptoms(
            for: examination.patient,
            initialSymptoms: examination.selectedSymptoms,
            initialVitals: examination.vitals,
            initialDiagnosis: examination.diagnosis,
            editingExaminationId: examination.id
        )
    }
}
