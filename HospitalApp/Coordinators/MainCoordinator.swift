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
        navigationController.popToRootViewController(animated: true)
    }
}
