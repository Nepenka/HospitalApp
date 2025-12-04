//
//  VitalsViewController.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 22/11/2025.
//

import UIKit
import Combine

class VitalsViewController: UIViewController {
    private let viewModel: VitalsViewModel
    private let selectedSymptoms: [Symptom]
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
    
    private let continueButton: UIButton = {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("Рассчитать степень тяжести", for: .normal)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 12
        button.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        return button
    }()
    
    private var inputFields: [UITextField] = []
    private var fieldKeyMap: [UITextField: String] = [:]
    
    init(viewModel: VitalsViewModel, selectedSymptoms: [Symptom], coordinator: MainCoordinator) {
        self.viewModel = viewModel
        self.selectedSymptoms = selectedSymptoms
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
        setupKeyboardDismiss()
    }
    
    private func setupUI() {
        // Принудительно устанавливаем светлую тему
        overrideUserInterfaceStyle = .light
        view.backgroundColor = .systemBackground
        title = "Витальные данные"
        
        view.addSubview(scrollView)
        scrollView.addSubview(contentView)
        view.addSubview(continueButton)
        
        // Создаем поля ввода
        let fields = [
            ("Возраст (лет)", "age"),
            ("Систолическое АД (мм рт.ст.)", "systolicBP"),
            ("Диастолическое АД (мм рт.ст.)", "diastolicBP"),
            ("SpO2 (%)", "spO2"),
            ("ЧСС (уд/мин)", "heartRate"),
            ("ЧД (в мин)", "respiratoryRate"),
            ("GCS (3-15)", "gcs")
        ]
        
        for fieldInfo in fields {
            let field = createInputField(title: fieldInfo.title, key: fieldInfo.key, placeholder: fieldInfo.placeholder)
            inputFields.append(field)
            contentView.addArrangedSubview(field)
        }
        
        // Добавляем информационные метки
        let mapLabel = createInfoLabel(text: "срАД: —")
        mapLabel.tag = 100
        contentView.addArrangedSubview(mapLabel)
        
        let hypotensionLabel = createInfoLabel(text: "Гипотензия: —")
        hypotensionLabel.tag = 101
        contentView.addArrangedSubview(hypotensionLabel)
        
        continueButton.addTarget(self, action: #selector(calculateTapped), for: .touchUpInside)
        
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: continueButton.topAnchor, constant: -16),
            
            contentView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            contentView.widthAnchor.constraint(equalTo: scrollView.widthAnchor),
            
            continueButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            continueButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            continueButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            continueButton.heightAnchor.constraint(equalToConstant: 50)
        ])
    }
    
    private func createInputField(title: String, key: String, placeholder: String) -> UITextField {
        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = title
        label.font = .systemFont(ofSize: 16, weight: .medium)
        
        let textField = UITextField()
        textField.translatesAutoresizingMaskIntoConstraints = false
        textField.borderStyle = .roundedRect
        textField.keyboardType = .numberPad
        textField.placeholder = placeholder
        textField.addTarget(self, action: #selector(textFieldChanged(_:)), for: .editingChanged)
        
        fieldKeyMap[textField] = key
        
        container.addSubview(label)
        container.addSubview(textField)
        
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: container.topAnchor),
            label.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            label.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            
            textField.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 8),
            textField.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            textField.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            textField.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            textField.heightAnchor.constraint(equalToConstant: 44)
        ])
        
        return textField
    }
    
    private func createInfoLabel(text: String) -> UILabel {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = text
        label.font = .systemFont(ofSize: 16, weight: .semibold)
        label.textColor = .systemBlue
        label.textAlignment = .center
        return label
    }
    
    private func setupBindings() {
        viewModel.$meanArterialPressure
            .sink { [weak self] value in
                if let label = self?.view.viewWithTag(100) as? UILabel {
                    label.text = "срАД: \(value)"
                }
            }
            .store(in: &cancellables)
        
        viewModel.$hypotensionStatus
            .sink { [weak self] value in
                if let label = self?.view.viewWithTag(101) as? UILabel {
                    label.text = "Гипотензия: \(value)"
                    label.textColor = value == "Да" ? .systemRed : .systemBlue
                }
            }
            .store(in: &cancellables)
        
        viewModel.$isValid
            .sink { [weak self] isValid in
                self?.continueButton.isEnabled = isValid
                self?.continueButton.alpha = isValid ? 1.0 : 0.5
            }
            .store(in: &cancellables)
    }
    
    @objc private func textFieldChanged(_ textField: UITextField) {
        guard let key = fieldKeyMap[textField] else { return }
        let value = Int(textField.text ?? "")
        
        switch key {
        case "age":
            viewModel.updateAge(value)
        case "systolicBP":
            viewModel.updateSystolicBP(value)
        case "diastolicBP":
            viewModel.updateDiastolicBP(value)
        case "spO2":
            viewModel.updateSpO2(value)
        case "heartRate":
            viewModel.updateHeartRate(value)
        case "respiratoryRate":
            viewModel.updateRespiratoryRate(value)
        case "gcs":
            viewModel.updateGCS(value)
        default:
            break
        }
    }
    
    @objc private func calculateTapped() {
        guard viewModel.isValid else {
            showAlert(message: "Пожалуйста, заполните все поля")
            return
        }
        coordinator.showResult(selectedSymptoms: selectedSymptoms, vitals: viewModel.vitals)
    }
    
    private func setupKeyboardDismiss() {
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tapGesture.cancelsTouchesInView = false
        view.addGestureRecognizer(tapGesture)
    }
    
    @objc private func dismissKeyboard() {
        view.endEditing(true)
    }
    
    private func showAlert(message: String) {
        let alert = UIAlertController(title: "Внимание", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}

