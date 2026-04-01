//
//  ExaminationViewController.swift
//  HospitalApp
//
//  Created by Владислав Перелыгин on 17/02/2026.
//

import UIKit
import Combine

class ExaminationsHistoryViewController: UIViewController {
    private let viewModel: ExaminationViewModel
    private let coordinator: MainCoordinator
    private var cancellables = Set<AnyCancellable>()
    
    private let searchController: UISearchController = {
        let controller = UISearchController(searchResultsController: nil)
        controller.obscuresBackgroundDuringPresentation = false
        controller.searchBar.placeholder = "Поиск по ФИО или дате"
        controller.searchBar.autocapitalizationType = .none
        return controller
    }()
    
    private let tableView: UITableView = {
        let tableView = UITableView(frame: .zero, style: .grouped)
        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.register(ExaminationCell.self, forCellReuseIdentifier: "ExaminationCell")
        return tableView
    }()
    
    init(viewModel: ExaminationViewModel, coordinator: MainCoordinator) {
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
    
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        viewModel.loadExaminations()
    }
    
    private func setupUI() {
        overrideUserInterfaceStyle = .light
        view.backgroundColor = .systemBackground
        title = "История осмотров"
        
        searchController.searchResultsUpdater = self
        navigationItem.searchController = searchController
        navigationItem.hidesSearchBarWhenScrolling = false
        definesPresentationContext = true
        
        view.addSubview(tableView)
        
        tableView.dataSource = self
        tableView.delegate = self
        tableView.keyboardDismissMode = .onDrag
        
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
    }
    
    private func setupBindings() {
        viewModel.$examinations
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.tableView.reloadData()
            }
            .store(in: &cancellables)
    }
}

extension ExaminationsHistoryViewController: UITableViewDataSource, UITableViewDelegate {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return viewModel.examinations.count
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "ExaminationCell", for: indexPath) as! ExaminationCell
        let exam = viewModel.examinations[indexPath.row]
        cell.configure(with: exam)
        return cell
    }
    
    func tableView(
        _ tableView: UITableView,
        contextMenuConfigurationForRowAt indexPath: IndexPath,
        point: CGPoint
    ) -> UIContextMenuConfiguration? {
        let exam = viewModel.examinations[indexPath.row]
        
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
            guard let self = self else { return UIMenu() }
            
            let shareAction = UIAction(title: "Поделиться", image: UIImage(systemName: "square.and.arrow.up")) { _ in
                let text = "\(exam.patient.fullName)\nДиагноз: \(exam.diagnosis)\nСтепень: \(exam.severityResult.severityGrade)"
                let activity = UIActivityViewController(activityItems: [text], applicationActivities: nil)
                self.present(activity, animated: true)
            }
            
            let editAction = UIAction(title: "Редактировать", image: UIImage(systemName: "pencil")) { _ in
                self.coordinator.editExamination(exam)
            }
            
            let deleteAction = UIAction(title: "Удалить", image: UIImage(systemName: "trash"), attributes: .destructive) { _ in
                self.viewModel.deleteExamination(id: exam.id)
            }
            
            return UIMenu(title: "", children: [shareAction, editAction, deleteAction])
        }
    }
    
    // при желании можно добавить свайп на удаление:
    func tableView(_ tableView: UITableView,
                   commit editingStyle: UITableViewCell.EditingStyle,
                   forRowAt indexPath: IndexPath) {
        if editingStyle == .delete {
            viewModel.deleteExamination(at: indexPath.row)
        }
    }
}

//MARK: - ExaminationCell
class ExaminationCell: UITableViewCell {
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
        formatter.dateFormat = "dd.MM.yyyy HH:mm"
        let dateString = formatter.string(from: examination.date)
        
        let grade = examination.severityResult.severityGrade
        let systolic = examination.vitals.systolicBP != nil ? "\(examination.vitals.systolicBP!) мм рт.ст." : "—"
        
        // Симптомы + субградации
        let symptomsText = examination.selectedSymptoms
            .prefix(3)
            .map { "\($0.name) (\($0.effectiveSubgrade.shortName))" }
            .joined(separator: ", ")
        
        titleLabel.text = "\(examination.patient.fullName) • \(dateString) • Степень \(grade)"
        detailLabel.text = "Диагноз: \(examination.diagnosis)\nСАД: \(systolic)\nСимптомы: \(symptomsText)"
    }
}

extension ExaminationsHistoryViewController: UISearchResultsUpdating {
    func updateSearchResults(for searchController: UISearchController) {
        viewModel.searchText = searchController.searchBar.text ?? ""
    }
}
