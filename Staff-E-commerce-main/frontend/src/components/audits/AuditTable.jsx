import React from "react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { formatVietnam, toVietnamTime } from "../../utils/dateTimeHelper";

const actionStyles = [
  { match: /^(create|add|insert|import)/i, label: "Tạo", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { match: /^(update|edit|patch|change|adjust)/i, label: "Cập nhật", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  { match: /^(delete|remove|disable|deactivate|cancel)/i, label: "Xóa / hủy", className: "bg-red-50 text-red-700 ring-red-200" },
  { match: /^(login|logout|auth)/i, label: "Đăng nhập", className: "bg-sky-50 text-sky-700 ring-sky-200" },
];

const describeAction = (action = "") =>
  actionStyles.find((style) => style.match.test(action)) || { label: null, className: "bg-gray-100 text-gray-700 ring-gray-200" };

const formatTime = (value) => {
  if (!value || !toVietnamTime(value)) return value || "—";
  const vn = toVietnamTime(value);
  return `${formatVietnam(value, "date")} ${String(vn.getHours()).padStart(2, "0")}:${String(vn.getMinutes()).padStart(2, "0")}:${String(vn.getSeconds()).padStart(2, "0")}`;
};

const cleanEntity = (value) => (!value || /^unknown$/i.test(value) ? "—" : value);

export default function AuditTable({
  openAuditDetailModal,
  listActivityLog,
  setSelectedActivityLog,
  page,
  totalPages,
  fetchListActivity,
}) {
  const openDetail = (activityLog) => {
    setSelectedActivityLog(activityLog);
    openAuditDetailModal();
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="management-table w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Thời gian</th>
              <th className="text-left">Nhân viên</th>
              <th className="text-left">Hành động</th>
              <th className="text-left">Đối tượng</th>
              <th className="text-left">Chi tiết</th>
              <th className="text-left">IP</th>
              <th className="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listActivityLog && listActivityLog.length > 0 ? (
              listActivityLog.map((activityLog, index) => {
                const action = describeAction(activityLog.action);
                return (
                  <tr key={activityLog.id ?? index} className="cursor-pointer" onClick={() => openDetail(activityLog)}>
                    <td className="whitespace-nowrap text-gray-700">{formatTime(activityLog.createdAt)}</td>
                    <td className="whitespace-nowrap font-medium text-gray-900">{activityLog.username || "—"}</td>
                    <td className="whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${action.className}`} title={activityLog.action}>
                        {activityLog.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{cleanEntity(activityLog.entityType)}</td>
                    <td className="max-w-xs truncate font-mono text-xs text-gray-500" title={activityLog.payload}>
                      {activityLog.payload || "—"}
                    </td>
                    <td className="whitespace-nowrap text-xs text-gray-500">{activityLog.ipAddress || "—"}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
                        onClick={(event) => { event.stopPropagation(); openDetail(activityLog); }}
                      >
                        <Eye size={14} /> Xem
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" className="py-10 text-center text-gray-500">
                  Không có dữ liệu hoạt động nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
        <span className="text-gray-600">
          Trang <strong className="text-gray-900">{page}</strong> / <strong className="text-gray-900">{totalPages || 1}</strong>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchListActivity(page - 1)}
            className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            disabled={page <= 1}
          >
            <ChevronLeft size={16} /> Trước
          </button>
          <button
            type="button"
            onClick={() => fetchListActivity(page + 1)}
            className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            disabled={page >= totalPages}
          >
            Sau <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
