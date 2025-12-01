//
//  AppCoordinator.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import UIKit

class AppCoordinator: Coordinator {
    var navigationController: UINavigationController
    private var mainCoordinator: MainCoordinator?
    
    init(navigationController: UINavigationController) {
        self.navigationController = navigationController
    }
    
    func start() {
        let coordinator = MainCoordinator(navigationController: navigationController)
        mainCoordinator = coordinator
        coordinator.start()
    }
}

