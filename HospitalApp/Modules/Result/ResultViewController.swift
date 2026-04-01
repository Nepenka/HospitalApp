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
    
    private let diagnosisField: UITextField = {
        let field = UITextField()
        field.translatesAutoresizingMaskIntoConstraints = false
        field.borderStyle = .none
        field.placeholder = "Диагноз"
        field.autocapitalizationType = .sentences
        field.backgroundColor = .secondarySystemBackground
        field.layer.cornerRadius = 14
        field.layer.masksToBounds = true
        field.layer.borderWidth = 1.5
        field.layer.borderColor = UIColor.black.cgColor
        field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        field.leftViewMode = .always
        return field
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
        title = "Результат оценки"
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupBindings()
        diagnosisField.text = viewModel.diagnosis
        setupKeyboardDismiss()
    }
    
    private func setupUI() {
        // Принудительно устанавливаем светлую тему
        overrideUserInterfaceStyle = .light
        view.backgroundColor = .systemGroupedBackground
        navigationItem.largeTitleDisplayMode = .never
        

        view.addSubview(contentView)
        view.addSubview(saveButton)
        view.addSubview(newExaminationButton)
        
        contentView.addArrangedSubview(severityCard)
        contentView.addArrangedSubview(diagnosisField)
        
        saveButton.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)
        newExaminationButton.addTarget(self, action: #selector(newExaminationTapped), for: .touchUpInside)
        
        NSLayoutConstraint.activate([
            contentView.topAnchor.constraint(equalTo: view.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: saveButton.bottomAnchor, constant: -50),
            contentView.widthAnchor.constraint(equalTo: view.widthAnchor),
            
            severityCard.heightAnchor.constraint(greaterThanOrEqualToConstant: 200),
            diagnosisField.heightAnchor.constraint(equalToConstant: 44),
            
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
        
        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        
        let stackView = UIStackView()
        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.axis = .vertical
        stackView.spacing = 16
        stackView.layoutMargins = UIEdgeInsets(top: 20, left: 20, bottom: 20, right: 20)
        stackView.isLayoutMarginsRelativeArrangement = true
        
        // Степень тяжести
        let levelLabel = UILabel()
        if result.severityGrade > 0 {
            levelLabel.text = "Степень \(result.severityGrade)"
        } else {
            levelLabel.text = "Степень 0 (нет реакции)"
        }
        levelLabel.font = .systemFont(ofSize: 28, weight: .bold)
        levelLabel.textColor = colorForSeverityGrade(result.severityGrade)
        levelLabel.textAlignment = .center
        
        // Пораженные системы с субградациями
        let systemsLabel = UILabel()
        let activeSystems = result.perSystemSubgrades.filter { $0.value != .none }
        if !activeSystems.isEmpty {
            var systemsText = "Субградации по системам:\n"
            for (system, subgrade) in activeSystems.sorted(by: { $0.key.displayName < $1.key.displayName }) {
                systemsText += "• \(system.displayName): \(subgrade.displayName)\n"
            }
            systemsLabel.text = systemsText
        } else {
            systemsLabel.text = "Нет пораженных систем"
        }
        systemsLabel.font = .systemFont(ofSize: 16)
        systemsLabel.numberOfLines = 0
        systemsLabel.textAlignment = .left
        
        // Объяснение
        let explanationLabel = UILabel()
        explanationLabel.text = result.explanation
        explanationLabel.font = .systemFont(ofSize: 14)
        explanationLabel.numberOfLines = 0
        explanationLabel.textAlignment = .left
        explanationLabel.textColor = .systemGray
        
        stackView.addArrangedSubview(levelLabel)
        stackView.addArrangedSubview(systemsLabel)
        stackView.addArrangedSubview(explanationLabel)
        
        scrollView.addSubview(stackView)
        severityCard.addSubview(scrollView)
        
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: severityCard.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: severityCard.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: severityCard.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: severityCard.bottomAnchor),
            
            stackView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            stackView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            stackView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            stackView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            stackView.widthAnchor.constraint(equalTo: scrollView.widthAnchor)
        ])
    }
    
    private func colorForSeverityGrade(_ grade: Int) -> UIColor {
        switch grade {
        case 0:
            return .systemGray
        case 1:
            return .systemGreen
        case 2:
            return .systemYellow
        case 3:
            return .systemOrange
        case 4:
            return .systemRed
        case 5:
            return .systemPurple
        default:
            return .systemGray
        }
    }
    
    @objc private func saveTapped() {
        viewModel.diagnosis = diagnosisField.text ?? ""
        let cleanDiagnosis = viewModel.diagnosis.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanDiagnosis.isEmpty else {
            showAlert(message: "Укажите диагноз перед сохранением", completion: nil)
            return
        }
        
        viewModel.saveExamination()
        showAlert(message: "Осмотр сохранен", completion: {
            self.coordinator.startNewExamination()
        })
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
    
    private func setupKeyboardDismiss() {
        let swipeDown = UISwipeGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        swipeDown.direction = .down
        view.addGestureRecognizer(swipeDown)
        
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tapGesture.cancelsTouchesInView = false
        view.addGestureRecognizer(tapGesture)
    }
    
    @objc private func dismissKeyboard() {
        view.endEditing(true)
    }
}
