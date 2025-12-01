//
//  ResultViewController.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import UIKit
import Combine

class ResultViewController: UIViewController {
    private let viewModel: ResultViewModel
    private let coordinator: MainCoordinator
    private var cancellables = Set<AnyCancellable>()
    
    private let scrollView: UIScrollView = {
        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        return scrollView
    }()
    
    private let contentView: UIStackView = {
        let stackView = UIStackView()
        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.axis = .vertical
        stackView.spacing = 20
        stackView.layoutMargins = UIEdgeInsets(top: 20, left: 16, bottom: 20, right: 16)
        stackView.isLayoutMarginsRelativeArrangement = true
        return stackView
    }()
    
    private let severityCard: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        view.backgroundColor = .systemBackground
        view.layer.cornerRadius = 16
        view.layer.shadowColor = UIColor.black.cgColor
        view.layer.shadowOffset = CGSize(width: 0, height: 2)
        view.layer.shadowRadius = 8
        view.layer.shadowOpacity = 0.1
        return view
    }()
    
    private let saveButton: UIButton = {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("Сохранить осмотр", for: .normal)
        button.backgroundColor = .systemGreen
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 12
        button.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        return button
    }()
    
    private let newExaminationButton: UIButton = {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("Новый осмотр", for: .normal)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 12
        button.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        return button
    }()
    
    init(viewModel: ResultViewModel, coordinator: MainCoordinator) {
        self.viewModel = viewModel
        self.coordinator = coordinator
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupBindings()
    }
    
    private func setupUI() {
        view.backgroundColor = .systemGroupedBackground
        title = "Результат оценки"
        
        view.addSubview(scrollView)
        scrollView.addSubview(contentView)
        view.addSubview(saveButton)
        view.addSubview(newExaminationButton)
        
        contentView.addArrangedSubview(severityCard)
        
        saveButton.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)
        newExaminationButton.addTarget(self, action: #selector(newExaminationTapped), for: .touchUpInside)
        
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: saveButton.topAnchor, constant: -16),
            
            contentView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentView.widthAnchor.constraint(equalTo: scrollView.widthAnchor),
            
            severityCard.heightAnchor.constraint(greaterThanOrEqualToConstant: 200),
            
            saveButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            saveButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            saveButton.bottomAnchor.constraint(equalTo: newExaminationButton.topAnchor, constant: -12),
            saveButton.heightAnchor.constraint(equalToConstant: 50),
            
            newExaminationButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            newExaminationButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            newExaminationButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            newExaminationButton.heightAnchor.constraint(equalToConstant: 50)
        ])
    }
    
    private func setupBindings() {
        viewModel.$severityResult
            .compactMap { $0 }
            .sink { [weak self] result in
                self?.updateUI(with: result)
            }
            .store(in: &cancellables)
    }
    
    private func updateUI(with result: SeverityResult) {
        severityCard.subviews.forEach { $0.removeFromSuperview() }
        
        let stackView = UIStackView()
        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.axis = .vertical
        stackView.spacing = 16
        stackView.layoutMargins = UIEdgeInsets(top: 20, left: 20, bottom: 20, right: 20)
        stackView.isLayoutMarginsRelativeArrangement = true
        
        // Степень тяжести
        let levelLabel = UILabel()
        levelLabel.text = result.level.displayName
        levelLabel.font = .systemFont(ofSize: 28, weight: .bold)
        levelLabel.textColor = colorForSeverity(result.level)
        levelLabel.textAlignment = .center
        
        let descriptionLabel = UILabel()
        descriptionLabel.text = result.description
        descriptionLabel.font = .systemFont(ofSize: 20, weight: .semibold)
        descriptionLabel.textAlignment = .center
        
        // Пораженные системы
        let systemsLabel = UILabel()
        systemsLabel.text = "Пораженные системы:\n" + result.affectedSystems.map { $0.displayName }.joined(separator: ", ")
        systemsLabel.font = .systemFont(ofSize: 16)
        systemsLabel.numberOfLines = 0
        systemsLabel.textAlignment = .center
        
        // Объяснение
        let explanationLabel = UILabel()
        explanationLabel.text = result.explanation
        explanationLabel.font = .systemFont(ofSize: 16)
        explanationLabel.numberOfLines = 0
        explanationLabel.textAlignment = .center
        explanationLabel.textColor = .systemGray
        
        stackView.addArrangedSubview(levelLabel)
        stackView.addArrangedSubview(descriptionLabel)
        stackView.addArrangedSubview(systemsLabel)
        stackView.addArrangedSubview(explanationLabel)
        
        severityCard.addSubview(stackView)
        
        NSLayoutConstraint.activate([
            stackView.topAnchor.constraint(equalTo: severityCard.topAnchor),
            stackView.leadingAnchor.constraint(equalTo: severityCard.leadingAnchor),
            stackView.trailingAnchor.constraint(equalTo: severityCard.trailingAnchor),
            stackView.bottomAnchor.constraint(equalTo: severityCard.bottomAnchor)
        ])
    }
    
    private func colorForSeverity(_ level: SeverityLevel) -> UIColor {
        switch level {
        case .level1:
            return .systemGreen
        case .level2:
            return .systemYellow
        case .level3:
            return .systemOrange
        case .level4:
            return .systemRed
        case .level5:
            return .systemPurple
        }
    }
    
    @objc private func saveTapped() {
        viewModel.saveExamination()
        showAlert(message: "Осмотр сохранен", completion: nil)
    }
    
    @objc private func newExaminationTapped() {
        coordinator.startNewExamination()
    }
    
    private func showAlert(message: String, completion: (() -> Void)?) {
        let alert = UIAlertController(title: "Успешно", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completion?()
        })
        present(alert, animated: true)
    }
}

