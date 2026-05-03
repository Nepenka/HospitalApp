import UIKit
import Combine

class PatientStartViewController: UIViewController {
    private let viewModel: PatientStartViewModel
    private let coordinator: MainCoordinator
    private var cancellables = Set<AnyCancellable>()
    
    private let contentView: UIStackView = {
        let stackView = UIStackView()
        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.axis = .vertical
        stackView.spacing = 16
        stackView.layoutMargins = UIEdgeInsets(top: 24, left: 16, bottom: 24, right: 16)
        stackView.isLayoutMarginsRelativeArrangement = true
        return stackView
    }()
    
    
    private let startButton: UIButton = {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("Начать осмотр", for: .normal)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 12
        button.titleLabel?.font = .systemFont(ofSize: 18, weight: .bold)
        return button
    }()
    
    private let historyButton: UIButton = {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("История осмотров", for: .normal)
        button.backgroundColor = .white
        button.setTitleColor(.systemBlue, for: .normal)
        button.layer.cornerRadius = 12
        button.layer.borderWidth = 1
        button.layer.borderColor = UIColor.systemBlue.cgColor
        button.titleLabel?.font = .systemFont(ofSize: 18, weight: .bold)
        return button
    }()
    
    private let fullNameField = UITextField.configureField(placeholder: "ФИО пациента")
    private let preliminaryDiagnosisField = UITextField.configureField(placeholder: "Предварительный диагноз")
    
    init(viewModel: PatientStartViewModel, coordinator: MainCoordinator) {
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
        setupKeyboardDismiss()
    }
    
    private func setupUI() {
        overrideUserInterfaceStyle = .light
        view.backgroundColor = .systemBackground
        navigationItem.title = "Данные пациента"
        navigationController?.navigationBar.prefersLargeTitles = true
        
        view.addSubview(contentView)
        
        contentView.addArrangedSubview(fullNameField)
        contentView.addArrangedSubview(preliminaryDiagnosisField)
        preliminaryDiagnosisField.autocapitalizationType = .sentences
        contentView.addArrangedSubview(startButton)
        contentView.addArrangedSubview(historyButton)
        
        startButton.addTarget(self, action: #selector(startTapped), for: .touchUpInside)
        historyButton.addTarget(self, action: #selector(historyTapped), for: .touchUpInside)
        
        NSLayoutConstraint.activate([
            contentView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            startButton.heightAnchor.constraint(equalToConstant: 50),
            historyButton.heightAnchor.constraint(equalToConstant: 50),
            contentView.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16)
        ])
    }
    
    private func setupBindings() {
        fullNameField.addTarget(self, action: #selector(textFieldChanged(_:)), for: .editingChanged)
        preliminaryDiagnosisField.addTarget(self, action: #selector(textFieldChanged(_:)), for: .editingChanged)
        
        viewModel.$isValid
            .sink { [weak self] isValid in
                self?.startButton.isEnabled = isValid
                self?.startButton.alpha = isValid ? 1.0 : 0.5
            }
            .store(in: &cancellables)
    }
    
    
    @objc private func textFieldChanged(_ sender: UITextField) {
        if sender === fullNameField {
            viewModel.fullName = sender.text ?? ""
        } else if sender === preliminaryDiagnosisField {
            viewModel.preliminaryDiagnosis = sender.text ?? ""
        }
    }
    
    @objc private func startTapped() {
        guard let patient = viewModel.createAndSavePatient() else {
            showAlert("Заполните ФИО пациента и предварительный диагноз")
            return
        }
        startButton.getTapButton()
        coordinator.showSymptoms(for: patient, initialDiagnosis: viewModel.cleanPreliminaryDiagnosis)
    }
    
    @objc private func historyTapped() {
        historyButton.getTapButton()
        coordinator.showExaminationHistory()
    }
    
    private func showAlert(_ message: String) {
        let alert = UIAlertController(title: "Внимание", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
    
    func reset() {
        viewModel.reset()
        fullNameField.text = ""
        preliminaryDiagnosisField.text = ""
    }
    
    private func setupKeyboardDismiss() {
        let swipeDown = UISwipeGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        swipeDown.direction = .down
        view.addGestureRecognizer(swipeDown)
        
        let tap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
    }
    
    @objc private func dismissKeyboard() {
        view.endEditing(true)
    }
}
