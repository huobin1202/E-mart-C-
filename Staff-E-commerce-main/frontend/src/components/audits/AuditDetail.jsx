import React from "react";
import { auditActionLabel, auditActor, auditBody, auditPayload, auditResult, auditSummary, auditTarget } from "../../utils/auditDisplay";
import { formatVietnam } from "../../utils/dateTimeHelper";

export default function AuditDetail({ onClose ,selectedActivityLog}) {
  const payload = auditPayload(selectedActivityLog);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center">
          <h3 className="text-xl font-bold">Chi Tiết Hoạt Động</h3>
          <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Nội dung chi tiết */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Thời gian:</strong>{" "}
              <span>{formatVietnam(selectedActivityLog.createdAt, "datetime")}</span>
            </div>
            <div>
              <strong>Người thực hiện:</strong>{" "}
              <span>{auditActor(selectedActivityLog)}</span>
            </div>
            <div>
              <strong>Hành động:</strong>{" "}
              <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full text-xs">
                {auditActionLabel(selectedActivityLog)}
              </span>
            </div>
            <div>
              <strong>Đối tượng:</strong>{" "}
              <span className="text-primary-600 font-medium">{auditTarget(selectedActivityLog)}</span>
            </div>
            <div>
              <strong>IP:</strong>{" "}
              <span>{selectedActivityLog.ipAddress}</span>
            </div>
            <div><strong>Kết quả:</strong> {auditSummary(selectedActivityLog)}</div>
          </div>

          {payload?.endpoint && <p className="text-sm"><strong>Nghiệp vụ:</strong> {payload.endpoint}</p>}
          {payload?.path && <p className="break-words text-sm"><strong>API:</strong> {payload.method} {payload.path}</p>}
          {payload?.parameters && Object.keys(payload.parameters).length > 0 && <p className="text-sm"><strong>Tham số:</strong> {JSON.stringify(payload.parameters)}</p>}
          {auditResult(selectedActivityLog) && <p className="text-sm"><strong>Kết quả xử lý:</strong> {auditResult(selectedActivityLog)}</p>}

          <div>
            <strong>Nội dung thao tác:</strong>
            <pre className="mt-2 p-3 bg-gray-100 rounded-lg text-xs overflow-x-auto font-mono whitespace-pre-wrap">
              {auditBody(selectedActivityLog)}
            </pre>
          </div>
        </div>
      </div>
      
    </div>
  );
}
