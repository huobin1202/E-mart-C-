// src/components/import/ImportModal.jsx
import React, { useState, useRef } from "react";
import { importProducts, importCustomers, downloadProductTemplate, downloadCustomerTemplate } from "../../api/importApi";

export default function ImportModal({ isOpen, onClose, onSuccess, type = "products" }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
        setError(null);
        setResult(null);
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
        setError(null);
        setResult(null);
      }
    }
  };

  const validateFile = (file) => {
    const validExtensions = [".csv", ".xlsx"];
    const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    
    if (!validExtensions.includes(extension)) {
      setError("Chỉ chấp nhận file CSV hoặc Excel (.csv, .xlsx)");
      return false;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError("Kích thước file không được vượt quá 10MB");
      return false;
    }

    return true;
  };

  const handleImport = async () => {
    if (!file) {
      setError("Vui lòng chọn file");
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      let importResult;
      if (type === "products") {
        importResult = await importProducts(file);
      } else if (type === "customers") {
        importResult = await importCustomers(file);
      } else {
        throw new Error("Loại import không được hỗ trợ");
      }

      setResult(importResult);
      
      // Nếu import thành công và không có lỗi, gọi onSuccess
      if (importResult && !importResult.hasErrors && onSuccess) {
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 2000);
      }
    } catch (err) {
      setError(err.message || "Lỗi khi import file");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async (format = "excel") => {
    try {
      setError(null); // Clear previous errors
      if (type === "products") {
        await downloadProductTemplate(format);
        // File will automatically download, no need to show message
      } else if (type === "customers") {
        await downloadCustomerTemplate(format);
        // File will automatically download, no need to show message
      }
    } catch (err) {
      console.error("Download template error:", err);
      setError(err.message || "Không thể tải template. Vui lòng kiểm tra console để xem chi tiết lỗi.");
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setImporting(false);
    onClose();
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">
            Import {type === "products" ? "Sản phẩm" : "Khách hàng"}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
            disabled={importing}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Download Template */}
          <div className="mb-4 p-3 bg-primary-50 rounded-lg">
            <p className="text-sm text-gray-700 mb-2">
              Tải file mẫu để biết định dạng dữ liệu:
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDownloadTemplate("excel")}
                className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
              >
                Tải Excel Template
              </button>
              <button
                onClick={() => handleDownloadTemplate("csv")}
                className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Tải CSV Template
              </button>
            </div>
          </div>

          {/* File Upload Area */}
          {!result && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? "border-primary-500 bg-primary-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="space-y-2">
                  <div className="text-emerald-600 text-lg">✓</div>
                  <p className="text-gray-700 font-medium">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(file.size)}
                  </p>
                  <button
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Xóa file
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-4xl text-gray-400">📁</div>
                  <div>
                    <p className="text-gray-700 mb-2">
                      Kéo thả file vào đây hoặc
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
                    >
                      Chọn file
                    </button>
                  </div>
                  <p className="text-sm text-gray-500">
                    Hỗ trợ: CSV, Excel (.xlsx) - Tối đa 10MB
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          {/* Import Progress */}
          {importing && (
            <div className="mt-4">
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                <p className="text-gray-700">Đang xử lý file...</p>
              </div>
            </div>
          )}

          {/* Import Result */}
          {result && !importing && (
            <div className="mt-4 space-y-4">
              {result.rolledBack && (
                <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
                  Có lỗi hệ thống nên toàn bộ file chưa được lưu. Hãy sửa lỗi bên dưới rồi import lại.
                </div>
              )}
              {/* Summary */}
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 bg-emerald-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-emerald-600">
                    {result.created || 0}
                  </div>
                  <div className="text-sm text-gray-600">Đã tạo</div>
                </div>
                <div className="p-4 bg-primary-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-primary-600">
                    {result.updated || 0}
                  </div>
                  <div className="text-sm text-gray-600">Đã cập nhật</div>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {result.skipped || 0}
                  </div>
                  <div className="text-sm text-gray-600">Đã bỏ qua</div>
                </div>
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {result.errors?.length || 0}
                  </div>
                  <div className="text-sm text-gray-600">Lỗi</div>
                </div>
              </div>

              {/* Errors List */}
              {result.errors && result.errors.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold text-gray-800 mb-2">
                    Chi tiết lỗi:
                  </h3>
                  <div className="max-h-60 overflow-y-auto border rounded">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left">Dòng</th>
                          <th className="px-3 py-2 text-left">Trường</th>
                          <th className="px-3 py-2 text-left">Lỗi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {result.errors.map((err, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2">{err.rowNumber}</td>
                            <td className="px-3 py-2">{err.field}</td>
                            <td className="px-3 py-2 text-red-600">
                              {err.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {!result.hasErrors && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-700">
                  ✓ Import thành công!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            disabled={importing}
          >
            {result ? "Đóng" : "Hủy"}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? "Đang xử lý..." : "Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

