//
//  SceneDelegate.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?


    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = ViewController()
        
        self.window = window
        window.makeKeyAndVisible()
    }

}

