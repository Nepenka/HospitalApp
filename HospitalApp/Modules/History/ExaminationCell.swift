//
//  ExaminationCell.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 02/04/2026.
//


import Foundation
import UIKit

final class ExaminationCell: UITableViewCell {
    static let identifer = "ExaminationCell"
    
    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    
    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        setupUI()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private func setupUI() {
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        detailLabel.translatesAutoresizingMaskIntoConstraints = false
        
        titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        detailLabel.font = .systemFont(ofSize: 14)
        detailLabel.textColor = .systemGray
        detailLabel.numberOfLines = 0
        
        contentView.addSubview(titleLabel)
        contentView.addSubview(detailLabel)
        
        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            titleLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            
            detailLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 4),
            detailLabel.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            detailLabel.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
            detailLabel.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -8)
        ])
    }
    
    func configure(with examination: Examination) {
        let formatter = DateFormatter()
        formatter.dateFormat = "dd.MM.yy HH:mm"
        let dateString = formatter.string(from: examination.date)
        
        let grade = examination.severityResult.severityGrade
        let systolic = examination.vitals.systolicBP != nil ? "\(examination.vitals.systolicBP!) мм рт.ст." : "нет"
        
        // Симптомы + субградации
        let symptomsText = examination.selectedSymptoms
            .prefix(3)
            .map { "\($0.name) (\($0.effectiveSubgrade.shortName))" }
            .joined(separator: ",")
        
        titleLabel.text = "\(examination.patient.fullName) \(dateString) Степень \(grade)"
        detailLabel.text = "Диагноз: \(examination.diagnosis)\nСАД: \(systolic)\nСимптомы: \(symptomsText)"
    }
}
