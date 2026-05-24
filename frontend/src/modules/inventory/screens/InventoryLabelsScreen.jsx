import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";

import Card from "../../../components/Card";
import { inventoryApi } from "../api";

export default function InventoryLabelsScreen({ templates, selectedItemIds, items, teams, onCreateTemplate, onUpdateTemplate, onDeleteTemplate, onGenerateLabels }) {
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0] || null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    width_mm: 62,
    height_mm: 29,
    qr_x_mm: 3,
    qr_y_mm: 3,
    qr_size_mm: 10,
    latex_template: ""
  });
  const [previewMode, setPreviewMode] = useState("code"); // "code" or "preview"
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  // Realistic sample data
  const sampleItem = {
    name: "Turistický batoh Deuter Futura Pro 36",
    category: "Turistika » Batohy",
    current_location: "Sklad A » Regál 3 » Police 2",
    default_location: "Sklad A » Regál 3 » Police 2",
    status: "Dostupné",
    qr_identifier: "SCT-2024-001"
  };

  useEffect(() => {
    if (selectedTemplate) {
      const defaultLatexTemplate = `\\documentclass[border=2pt]{standalone}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{qrcode}
\\usepackage{geometry}
\\geometry{paperwidth=${selectedTemplate.width_mm}mm,paperheight=${selectedTemplate.height_mm}mm,margin=0pt}

\\begin{document}
\\pagestyle{empty}

\\begin{minipage}[t][${selectedTemplate.height_mm}mm][t]{${selectedTemplate.width_mm}mm}
\\vspace*{3mm}
\\hspace*{3mm}\\qrcode[height=${selectedTemplate.qr_size_mm || 10}mm]{{{{qr_identifier}}}}

\\vspace{-${selectedTemplate.height_mm - 10}mm}
\\hspace*{${(selectedTemplate.qr_size_mm || 10) + 6}mm}
\\begin{minipage}{${selectedTemplate.width_mm - (selectedTemplate.qr_size_mm || 10) - 9}mm}
\\textbf{{{name}}} \\\\
\\small {{category}} \\\\
\\tiny {{default_location}} \\\\
\\end{minipage}
\\end{minipage}

\\end{document}`;

      setEditForm({
        name: selectedTemplate.name,
        width_mm: selectedTemplate.width_mm,
        height_mm: selectedTemplate.height_mm,
        qr_x_mm: selectedTemplate.qr_x_mm || 3,
        qr_y_mm: selectedTemplate.qr_y_mm || 3,
        qr_size_mm: selectedTemplate.qr_size_mm || 10,
        latex_template: selectedTemplate.latex_template || defaultLatexTemplate
      });
    }
  }, [selectedTemplate]);

  const getPreviewLatex = () => {
    let previewLatex = editForm.latex_template;

    // Replace placeholders with sample data
    const replacements = {
      'name': sampleItem.name,
      'category': sampleItem.category,
      'current_location': sampleItem.current_location,
      'default_location': sampleItem.default_location,
      'status': sampleItem.status,
      'qr_identifier': sampleItem.qr_identifier
    };

    Object.entries(replacements).forEach(([field, value]) => {
      const regex = new RegExp(`\\{\\{${field}\\}\\}`, 'g');
      previewLatex = previewLatex.replace(regex, value || '');
    });

    return previewLatex;
  };

  const generatePreview = async () => {
    setIsGeneratingPreview(true);
    try {
      console.log('Sending preview request:', {
        template_id: selectedTemplate?.id,
        latex_template: editForm.latex_template
      });

      const requestData = {
        latex_template: editForm.latex_template
      };

      // Only add template_id if it exists
      if (selectedTemplate?.id) {
        requestData.template_id = selectedTemplate.id;
      }

      const response = await inventoryApi.previewLatexTemplate(requestData);

      console.log('Preview response:', response);
      setPreviewData(response);
      setPreviewMode("preview");
    } catch (error) {
      console.error('Error generating preview:', error);
      console.error('Error details:', error.response?.data);
      alert('Chyba při generování náhledu: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const insertPlaceholder = (placeholder) => {
    const textarea = document.getElementById('latex-editor');
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = editForm.latex_template;
      const newValue = currentValue.slice(0, start) + `{{${placeholder}}}` + currentValue.slice(end);

      setEditForm(prev => ({ ...prev, latex_template: newValue }));

      // Restore cursor position
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + placeholder.length + 4, start + placeholder.length + 4);
      }, 0);
    }
  };

  const handleSave = () => {
    const templateData = {
      name: editForm.name,
      width_mm: editForm.width_mm,
      height_mm: editForm.height_mm,
      qr_x_mm: editForm.qr_x_mm,
      qr_y_mm: editForm.qr_y_mm,
      qr_size_mm: editForm.qr_size_mm,
      latex_template: editForm.latex_template,
      team_id: teams && teams.length > 0 ? teams[0].id : 1,
      fields: "[]" // Keep for backward compatibility
    };

    if (selectedTemplate) {
      onUpdateTemplate(selectedTemplate.id, templateData);
    } else {
      onCreateTemplate(templateData);
    }
    setIsEditing(false);
  };

  const startNewTemplate = () => {
    const defaultLatexTemplate = `\\documentclass[border=2pt]{standalone}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{qrcode}
\\usepackage{geometry}
\\geometry{paperwidth=62mm,paperheight=29mm,margin=0pt}

\\begin{document}
\\pagestyle{empty}

\\begin{minipage}[t][29mm][t]{62mm}
\\vspace*{3mm}
\\hspace*{3mm}\\qrcode[height=10mm]{{{{qr_identifier}}}}

\\vspace{-19mm}
\\hspace*{16mm}
\\begin{minipage}{43mm}
\\textbf{{{name}}} \\\\
\\small {{category}} \\\\
\\tiny {{default_location}} \\\\
\\end{minipage}
\\end{minipage}

\\end{document}`;

    setSelectedTemplate(null);
    setEditForm({
      name: "Nová šablona",
      width_mm: 62,
      height_mm: 29,
      qr_x_mm: 3,
      qr_y_mm: 3,
      qr_size_mm: 10,
      latex_template: defaultLatexTemplate
    });
    setIsEditing(true);
  };

  return (
    <div className="row g-4">
      <div className="col-12 col-xl-4">
        <Card className="border-0 shadow-lg h-100" title="Šablony štítků" icon={<i className="fas fa-tags"></i>}>
          <button type="button" className="btn btn-primary w-100 mb-3" onClick={startNewTemplate}>
            <i className="fas fa-plus me-2"></i>Nová šablona
          </button>
          <div className="inventory-activity-list">
            {templates.map((template) => (
              <div
                key={template.id}
                className={`inventory-activity-row ${selectedTemplate?.id === template.id ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelectedTemplate(template);
                  setIsEditing(false);
                }}
              >
                <div>
                  <strong>{template.name}</strong>
                  <div className="small text-muted">{template.width_mm} × {template.height_mm} mm</div>
                </div>
                <div className="ms-auto">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary me-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTemplate(template);
                      setIsEditing(true);
                    }}
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Opravdu chcete smazat tuto šablonu?')) {
                        onDeleteTemplate(template.id);
                        if (selectedTemplate?.id === template.id) {
                          setSelectedTemplate(null);
                        }
                      }
                    }}
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {selectedTemplate && (
            <div className="mt-3 pt-3 border-top">
              <div className="d-flex gap-2">
                <span className="text-muted align-self-center flex-grow-1">Vybrané věci: {selectedItemIds.length}</span>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={() => onGenerateLabels(selectedTemplate.id, selectedItemIds)}
                  disabled={selectedItemIds.length === 0}
                >
                  <i className="fas fa-file-pdf me-1"></i>Vytvořit štítek
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="col-12 col-xl-8">
        <Card className="border-0 shadow-lg h-100" title={isEditing ? "LaTeX Editor štítku" : "Náhled štítku"} icon={<i className="fas fa-edit"></i>}>
          {selectedTemplate || isEditing ? (
            <div>
              {isEditing && (
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <label className="form-label">Název šablony</label>
                    <input
                      className="form-control form-control-sm"
                      value={editForm.name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Šířka (mm)</label>
                    <input
                      className="form-control form-control-sm"
                      type="number"
                      min="10"
                      max="200"
                      step="0.5"
                      value={editForm.width_mm}
                      onChange={(e) => setEditForm(prev => ({ ...prev, width_mm: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Výška (mm)</label>
                    <input
                      className="form-control form-control-sm"
                      type="number"
                      min="10"
                      max="200"
                      step="0.5"
                      value={editForm.height_mm}
                      onChange={(e) => setEditForm(prev => ({ ...prev, height_mm: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              )}

              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span>LaTeX šablona štítku</span>
                  <div>
                    {isEditing && (
                      <div className="btn-group btn-group-sm me-2">
                        <button
                          className={`btn ${previewMode === 'code' ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => setPreviewMode('code')}
                        >
                          <i className="fas fa-code me-1"></i>Kód
                        </button>
                        <button
                          className={`btn ${previewMode === 'preview' ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={generatePreview}
                          disabled={isGeneratingPreview}
                        >
                          {isGeneratingPreview ? (
                            <i className="fas fa-spinner fa-spin me-1"></i>
                          ) : (
                            <i className="fas fa-eye me-1"></i>
                          )}
                          Náhled
                        </button>
                      </div>
                    )}
                    {!isEditing && selectedTemplate && (
                      <button
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => setIsEditing(true)}
                      >
                        <i className="fas fa-edit me-1"></i>Upravit
                      </button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  previewMode === 'code' ? (
                    <div>
                      <div className="mb-2">
                        <small className="text-muted">Dostupné placeholders: </small>
                        {['name', 'category', 'current_location', 'default_location', 'status', 'qr_identifier'].map(field => (
                          <button
                            key={field}
                            className="btn btn-outline-info btn-sm me-1 mb-1"
                            style={{ fontSize: '10px', padding: '2px 6px' }}
                            onClick={() => insertPlaceholder(field)}
                          >
                            {'{{'}{field}{'}}'}
                          </button>
                        ))}
                      </div>
                      <textarea
                        id="latex-editor"
                        className="form-control"
                        rows="20"
                        style={{ fontFamily: 'monospace', fontSize: '12px' }}
                        value={editForm.latex_template}
                        onChange={(e) => setEditForm(prev => ({ ...prev, latex_template: e.target.value }))}
                        placeholder="LaTeX kód šablony štítku..."
                      />
                    </div>
                  ) : (
                    <div className="border rounded p-3 bg-light" style={{ minHeight: '400px' }}>
                      {previewData ? (
                        <div>
                          <div className="mb-3">
                            <h6>LaTeX kód s ukázkovými daty:</h6>
                            <pre className="bg-white border rounded p-2" style={{ fontSize: '11px', maxHeight: '200px', overflow: 'auto' }}>
                              {previewData.latex_code}
                            </pre>
                          </div>
                          <div>
                            <h6>Ukázková data:</h6>
                            <div className="row g-2">
                              {Object.entries(previewData.sample_data).map(([key, value]) => (
                                <div key={key} className="col-md-6">
                                  <small><strong>{key}:</strong> {value}</small>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="d-flex justify-content-center align-items-center h-100">
                          <div className="text-center">
                            <i className="fas fa-eye fa-3x text-muted mb-3"></i>
                            <div className="text-muted">Klikněte na "Náhled" pro zobrazení</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="border rounded p-3 bg-light" style={{ minHeight: '300px' }}>
                    <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                      {selectedTemplate?.latex_template || 'Žádná LaTeX šablona'}
                    </pre>
                  </div>
                )}
              </div>

              {isEditing && (
                <div className="row g-3">
                  <div className="col-12">
                    <div className="d-flex gap-2">
                      <button className="btn btn-primary" onClick={handleSave}>
                        <i className="fas fa-save me-2"></i>Uložit šablonu
                      </button>
                      <button className="btn btn-outline-secondary" onClick={() => setIsEditing(false)}>
                        Zrušit
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted text-center py-5">
              <i className="fas fa-tags fa-3x mb-3"></i>
              <div>Vyberte šablonu ze seznamu nebo vytvořte novou</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

InventoryLabelsScreen.propTypes = {
  templates: PropTypes.array.isRequired,
  selectedItemIds: PropTypes.array.isRequired,
  onCreateTemplate: PropTypes.func.isRequired,
  onUpdateTemplate: PropTypes.func.isRequired,
  onDeleteTemplate: PropTypes.func.isRequired,
  onGenerateLabels: PropTypes.func.isRequired,
};
