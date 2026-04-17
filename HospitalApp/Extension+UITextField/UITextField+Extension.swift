//
//  UITextField+Extension.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 02/04/2026.
//

import UIKit

extension UITextField {
    
     static func configureField(placeholder: String) -> UITextField {
         let field = UITextField()
        field.borderStyle = .none
        field.placeholder = placeholder
        field.autocapitalizationType = .words
        field.font = .systemFont(ofSize: 17, weight: .regular)
        field.backgroundColor = .secondarySystemBackground
        field.layer.cornerRadius = 16
        field.layer.masksToBounds = true
        field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 1))
        field.leftViewMode = .always
        field.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 1))
        field.rightViewMode = .always
        field.translatesAutoresizingMaskIntoConstraints = false
        field.heightAnchor.constraint(equalToConstant: 56).isActive = true
        
        return field
    }
    
}
