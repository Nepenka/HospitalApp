//
//  UIButton+Extension.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 26/04/2026.
//

import UIKit
import Foundation


extension UIButton {
    
    func getTapButton() {
        UIView.animate(withDuration: 0.2, animations: {
            self.transform = CGAffineTransform(scaleX: 0.90, y: 0.90)
            self.alpha = 0.85
        })
        
        UIView.animate(withDuration: 0.1) {
            self.transform = .identity
            self.alpha = 1
        }
    }
}
