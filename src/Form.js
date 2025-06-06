import React, { useState, useRef } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import download from 'downloadjs';

function Form() {
  const [formData, setFormData] = useState({
    contactName: '',
    position: '',
    signatureFile: null,
    signatureDataURL: '',
    date: '',
    companyName: '',
    policyNumber: '',
    lastYearRevenue: '',
    currentYearRevenue: '',
    lastIntlRevenuePercent: '',
    currentIntlRevenuePercent: '',
    employeeCount: '',
    currentPayroll: '',
    businessDescription: '',
    propertySumChanged: false,
    propertySumDetails: '',
    awareOfClaims: false,
    claimDetails: '',
    claimFile: null,
    wantQuote: false,
    additionalInfo: '',
  });

  const [sectionOneComplete, setSectionOneComplete] = useState(false);
  const [signatureMode, setSignatureMode] = useState('upload');
  const [drawing, setDrawing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const canvasRef = useRef(null);
  const sectionTwoRef = useRef(null);

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'file' ? files[0] : value,
    }));
  };

  const validateSectionOne = () => {
    const { contactName, position, signatureFile, signatureDataURL, date } = formData;
    return contactName && position && (signatureFile || signatureDataURL) && date;
  };

  const handleContinue = (e) => {
    e.preventDefault();
    if (validateSectionOne()) {
      setSectionOneComplete(true);
      sectionTwoRef.current.scrollIntoView({ behavior: 'smooth' });
    } else {
      alert('Please complete all required fields in Section 1.');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowModal(true);
  };

  const drawSlash = (page, x, y) => {
    page.drawSvgPath('M0 0 L8 8', {
      x,
      y,
      scale: 1,
      color: rgb(0, 0, 0),
      borderWidth: 2,
      opacity: 1,
    });
  };

  const handleDownloadPDF = async () => {
    try {
      const formUrl = `${process.env.PUBLIC_URL}/CFC_Renewal_Form.pdf`;
      const existingPdfBytes = await fetch(formUrl).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const form = pdfDoc.getForm();

      const safeSet = (name, value) => {
        try {
          form.getTextField(name).setText(value || '');
        } catch {
          console.warn(`Field not found: ${name}`);
        }
      };

      const setCheckBoxValue = (fieldName, condition) => {
        try {
          const checkbox = form.getCheckBox(fieldName);
          condition ? checkbox.check() : checkbox.uncheck();
        } catch (err) {
          console.warn(`Checkbox not set: ${fieldName}`, err);
        }
      };

      const formatDate = (isoDate) => {
        if (!isoDate) return '';
        const [year, month, day] = isoDate.split('-');
        return `${month}/${day}/${year}`;
      };

      safeSet('Text field 101053', formatDate(formData.date));
      safeSet('Text field 1030', formData.contactName);
      safeSet('Text field 1024', formData.position);
      // safeSet('Text field 101053', formData.date);
      safeSet('CompanyName', formData.companyName);
      safeSet('PolicyNumber', formData.policyNumber);
      safeSet('Text field 1048', formData.lastYearRevenue);
      safeSet('Text field 1044', formData.currentYearRevenue);
      safeSet('Text field 1047', formData.lastIntlRevenuePercent);
      safeSet('Text field 1046b', formData.currentIntlRevenuePercent);
      safeSet('Text field 1046', formData.employeeCount);
      safeSet('Text field 1042', formData.currentPayroll);
      safeSet('Text field 1029', formData.businessDescription);
      safeSet('Text field 1031', formData.propertySumDetails);
      safeSet('Text field 1032', formData.additionalInfo);

      const page = pdfDoc.getPages()[0];

      const checkboxMap = [
        { name: 'Check Box 24', checked: formData.propertySumChanged, x: 275, y: 534 },
        { name: 'Check Box 20', checked: formData.awareOfClaims, x: 181, y: 423.5 },
        { name: 'Check Box 22', checked: formData.wantQuote, x: 504, y: 381 },
      ];

      checkboxMap.forEach(({ name, checked }) => {
        setCheckBoxValue(name, checked);
      });

      form.flatten();

      const embedSignature = async (sigBytes, isUpload = false) => {
        const sigImg = await pdfDoc.embedPng(sigBytes);
        const sigDims = sigImg.scale(isUpload ? 0.07 : 0.2);
        const coords = isUpload ? { x: 170, y: 30 } : { x: 150, y: 42 };
        page.drawImage(sigImg, {
          x: coords.x,
          y: coords.y,
          width: sigDims.width,
          height: sigDims.height,
        });
      };

      const finalizePDF = async () => {
        if (formData.awareOfClaims) {
          const claimPage = pdfDoc.addPage();
          claimPage.drawText('Claim Details:', { x: 50, y: 750, size: 14 });
          claimPage.drawText(formData.claimDetails || '', { x: 50, y: 730, size: 10 });
          if (formData.claimFile) {
            const filePage = pdfDoc.addPage();
            filePage.drawText('Attached File Notice:', { x: 50, y: 750, size: 14 });
            filePage.drawText(`Filename: ${formData.claimFile.name}`, { x: 50, y: 730, size: 10 });
          }
        }

        checkboxMap.forEach(({ checked, x, y }) => {
          if (!checked) {
            drawSlash(page, x + 22, y + 6);
          }
        });

        const finalPdfBytes = await pdfDoc.save();
        download(finalPdfBytes, 'CFC_Renewal_Filled.pdf', 'application/pdf');
      };

      if (formData.signatureFile) {
        const sigBytes = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsArrayBuffer(formData.signatureFile);
        });
        await embedSignature(sigBytes, true);
      }

      if (formData.signatureDataURL) {
        const sigBytes = await fetch(formData.signatureDataURL).then(res => res.arrayBuffer());
        await embedSignature(sigBytes);
      }

      await finalizePDF();
    } catch (err) {
      console.error('Failed to fill PDF:', err);
      alert('There was a problem generating the PDF. Please ensure the file exists and is fillable.');
    }
  };

  const drawOnCanvas = (e) => {
    if (!drawing || signatureMode !== 'draw') return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveCanvasAsImage = () => {
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');
    setFormData(prev => ({ ...prev, signatureFile: null, signatureDataURL: dataURL }));
    alert('Signature saved.');
  };

  const stopDrawing = () => {
    setDrawing(false);
    canvasRef.current?.getContext('2d').beginPath();
  };

  return (
    <div className="container-fluid px-0">
      {/* Header */}
      <nav className="navbar navbar-dark bg-primary justify-content-center mb-4">
        <span className="navbar-brand mb-0 d-flex align-items-center gap-2">
          <img
            src={`${process.env.PUBLIC_URL}/cfc-logo.jpg`}
            alt="CFC Logo"
            height="40"
            className="mr-2"
          />
          <span className="h5 mb-0 text-white">CFC R&D Renewal Form</span>
        </span>
      </nav>

      {/* Section 1: Contact Information */}
      <div className="container">
        <div className="card mx-auto mb-4 shadow" style={{ maxWidth: '700px' }}>
          <div className="card-body">
            <h5 className="card-title font-weight-bold">Important Notice</h5>
            <p className="card-text">
              By signing this form you agree that the information provided is both accurate and complete and
              that you have made all reasonable attempts to ensure this is the case by asking the appropriate
              people within your business. For details on our privacy policy visit{' '}
              <a href="https://www.cfcunderwriting.com/privacy" target="_blank" rel="noopener noreferrer">
                www.cfcunderwriting.com/privacy
              </a>.
            </p>
            
            <form onSubmit={handleContinue}>
              <div className="form-group mb-3">
                <label>Contact Name *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  name="contactName" 
                  value={formData.contactName}
                  onChange={handleChange} 
                  required
                />
              </div>
              
              <div className="form-group mb-3">
                <label>Position *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  name="position" 
                  value={formData.position}
                  onChange={handleChange} 
                  required
                />
              </div>
              
              <div className="form-group mb-3">
                <label>Signature *</label>
                <div className="btn-group mb-2" role="group">
                  <button 
                    type="button" 
                    className={`btn btn-sm ${signatureMode === 'upload' ? 'btn-primary' : 'btn-outline-primary'}`} 
                    onClick={() => setSignatureMode('upload')}
                  >
                    Upload
                  </button>
                  <button 
                    type="button" 
                    className={`btn btn-sm ${signatureMode === 'draw' ? 'btn-primary' : 'btn-outline-primary'}`} 
                    onClick={() => setSignatureMode('draw')}
                  >
                    Draw
                  </button>
                </div>
                
                {signatureMode === 'upload' ? (
                  <input 
                    type="file" 
                    className="form-control" 
                    name="signatureFile" 
                    accept="image/*" 
                    onChange={handleChange} 
                  />
                ) : (
                  <>
                    <canvas 
                      ref={canvasRef} 
                      width={500} 
                      height={150} 
                      style={{ border: '1px solid #ccc', width: '100%', cursor: 'crosshair' }} 
                      onMouseDown={() => setDrawing(true)} 
                      onMouseUp={stopDrawing} 
                      onMouseOut={stopDrawing} 
                      onMouseMove={drawOnCanvas}
                    />
                    <div className="mt-2">
                      <button type="button" className="btn btn-sm btn-secondary mr-2" onClick={clearCanvas}>
                        Clear
                      </button>
                      <button type="button" className="btn btn-sm btn-success" onClick={saveCanvasAsImage}>
                        Save Drawing
                      </button>
                    </div>
                  </>
                )}
              </div>
              
              <div className="form-group mb-4">
                <label>Date *</label>
                <input 
                  type="date" 
                  className="form-control" 
                  name="date" 
                  value={formData.date}
                  onChange={handleChange} 
                  required
                />
              </div>
              
              <button type="submit" className="btn btn-primary w-100">
                Continue to Company Details
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Section 2: Company Details */}
      <div className="container" ref={sectionTwoRef}>
        <div 
          className={`card mx-auto shadow ${sectionOneComplete ? '' : 'disabled'}`} 
          style={{ 
            maxWidth: '800px', 
            opacity: sectionOneComplete ? 1 : 0.2, 
            pointerEvents: sectionOneComplete ? 'auto' : 'none', 
            transition: 'opacity 0.3s ease', 
            marginBottom: '4rem' 
          }}
        >
          <div className="card-body">
            <h5 className="card-title">Company Details</h5>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group mb-3">
                <label>Company Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  name="companyName" 
                  value={formData.companyName}
                  onChange={handleChange} 
                />
              </div>
              
              <div className="form-group mb-3">
                <label>Policy Number</label>
                <input 
                  type="text" 
                  className="form-control" 
                  name="policyNumber" 
                  value={formData.policyNumber}
                  onChange={handleChange} 
                />
              </div>
              
              <div className="row">
                <div className="form-group col-md-6 mb-3">
                  <label>Last FY Revenue ($)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    name="lastYearRevenue" 
                    value={formData.lastYearRevenue}
                    onChange={handleChange} 
                  />
                </div>
                <div className="form-group col-md-6 mb-3">
                  <label>Estimate Current FY Revenue ($)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    name="currentYearRevenue" 
                    value={formData.currentYearRevenue}
                    onChange={handleChange} 
                  />
                </div>
              </div>
              
              <div className="row">
                <div className="form-group col-md-6 mb-3">
                  <label>Last FY Intl. Sales (%)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    name="lastIntlRevenuePercent" 
                    value={formData.lastIntlRevenuePercent}
                    onChange={handleChange} 
                  />
                </div>
                <div className="form-group col-md-6 mb-3">
                  <label>Estimate Current FY Intl. Sales (%)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    name="currentIntlRevenuePercent" 
                    value={formData.currentIntlRevenuePercent}
                    onChange={handleChange} 
                  />
                </div>
              </div>
              
              <div className="row">
                <div className="form-group col-md-6 mb-3">
                  <label>Current Number of Employees</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    name="employeeCount" 
                    value={formData.employeeCount}
                    onChange={handleChange} 
                  />
                </div>
                <div className="form-group col-md-6 mb-3">
                  <label>Estimate Current Payroll ($)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    name="currentPayroll" 
                    value={formData.currentPayroll}
                    onChange={handleChange} 
                  />
                </div>
              </div>
              
              <div className="form-group mb-3">
                <label>Updated Business Description</label>
                <textarea 
                  className="form-control" 
                  name="businessDescription" 
                  rows="3" 
                  value={formData.businessDescription}
                  onChange={handleChange}
                />
              </div>
              
              <div className="form-check mb-2">
                <input 
                  className="form-check-input" 
                  type="checkbox" 
                  id="propertySumChanged" 
                  checked={formData.propertySumChanged} 
                  onChange={handleChange} 
                  name="propertySumChanged" 
                />
                <label className="form-check-label" htmlFor="propertySumChanged">
                  Any change in property sum insured?
                </label>
              </div>
              
              {formData.propertySumChanged && (
                <div className="form-group mb-3">
                  <label>Description:</label>
                  <textarea 
                    className="form-control" 
                    name="propertySumDetails" 
                    rows="2" 
                    value={formData.propertySumDetails}
                    onChange={handleChange}
                  />
                </div>
              )}
              
              <div className="form-check mb-2">
                <input 
                  className="form-check-input" 
                  type="checkbox" 
                  id="awareOfClaims" 
                  checked={formData.awareOfClaims} 
                  onChange={handleChange} 
                  name="awareOfClaims" 
                />
                <label className="form-check-label" htmlFor="awareOfClaims">
                  Aware of any claims/loss/damage?
                </label>
              </div>
              
              {formData.awareOfClaims && (
                <>
                  <div className="form-group mb-3">
                    <label>Details:</label>
                    <textarea 
                      className="form-control" 
                      name="claimDetails" 
                      rows="2" 
                      value={formData.claimDetails}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group mb-3">
                    <label>Attach related file (optional)</label>
                    <input 
                      type="file" 
                      className="form-control" 
                      name="claimFile" 
                      onChange={handleChange} 
                      accept=".pdf,.doc,.docx,.jpg,.png" 
                    />
                  </div>
                </>
              )}
              
              <div className="form-check mb-3">
                <input 
                  className="form-check-input" 
                  type="checkbox" 
                  name="wantQuote" 
                  onChange={handleChange} 
                  checked={formData.wantQuote} 
                />
                <label className="form-check-label">Would you like a quote this year?</label>
              </div>
              
              <div className="form-group mb-4">
                <label>Additional Information</label>
                <textarea 
                  className="form-control" 
                  name="additionalInfo" 
                  rows="2" 
                  value={formData.additionalInfo}
                  onChange={handleChange}
                />
              </div>
              
              <button type="submit" className="btn btn-success w-100">Submit</button>
            </form>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showModal && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" 
          style={{ 
            zIndex: 1055,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(2px)'
          }}
        >
          <div 
            className="bg-white rounded-3 shadow-lg" 
            style={{ 
              maxWidth: '450px', 
              width: '90%',
              margin: '20px',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
          >
            <div className="p-4">
              <div className="text-center mb-4">
                <div className="mb-3">
                  <svg 
                    width="64" 
                    height="64" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    className="text-success"
                  >
                    <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.1"/>
                    <path 
                      d="M9 12l2 2 4-4" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h4 className="mb-2 text-success">Submission Complete!</h4>
                <p className="text-muted mb-0">
                  Your CFC R&D renewal form has been submitted successfully.
                </p>
              </div>
              
              <div className="d-grid gap-2 mb-3">
                <button 
                  onClick={handleDownloadPDF} 
                  className="btn btn-primary btn-lg d-flex align-items-center justify-content-center gap-2"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path 
                      d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />
                    <polyline 
                      points="7,10 12,15 17,10" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />
                    <line 
                      x1="12" y1="15" x2="12" y2="3" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round"
                    />
                  </svg>
                  Download Filled PDF
                </button>
              </div>
              
              <div className="text-center">
                <button 
                  onClick={() => setShowModal(false)} 
                  className="btn btn-outline-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Form;