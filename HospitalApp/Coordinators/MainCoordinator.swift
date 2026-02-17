//
//  MainCoordinator.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import UIKit

class MainCoordinator: Coordinator {
    var navigationController: UINavigationController
    
    init(navigationController: UINavigationController) {
        self.navigationController = navigationController
    }
    
    func start() {
        let viewModel = SymptomsViewModel()
        let viewController = SymptomsViewController(viewModel: viewModel, coordinator: self)
        navigationController.pushViewController(viewController, animated: false)
    }
    
    func showVitalsInput(selectedSymptoms: [Symptom]) {
        let viewModel = VitalsViewModel()
        let viewController = VitalsViewController(
            viewModel: viewModel,
            selectedSymptoms: selectedSymptoms,
            coordinator: self
        )
        navigationController.pushViewController(viewController, animated: true)
    }
    
    func showResult(selectedSymptoms: [Symptom], vitals: Vitals) {
        let viewModel = ResultViewModel()
        viewModel.calculateSeverity(selectedSymptoms: selectedSymptoms, vitals: vitals)
        let viewController = ResultViewController(viewModel: viewModel, coordinator: self)
        navigationController.pushViewController(viewController, animated: true)
    }
    
    func startNewExamination() {
        if let rootVC = navigationController.viewControllers.first as? SymptomsViewController {
            rootVC.reset()
        }
        navigationController.popToRootViewController(animated: true)
    }
    
    func showExaminationHistory() {
        let viewModel = ExaminationViewModel()
        let controller = ExaminationsHistoryViewController(viewModel: viewModel, coordinator: self)
        navigationController.pushViewController(controller, animated: true)
        
    }
}
