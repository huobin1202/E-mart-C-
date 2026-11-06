import React from "react";
import AuditTable from "../../components/audits/AuditTable";
import AuditDetail from "../../components/audits/AuditDetail";
import { useAudit } from "../../hook/useAudit";


export default function AuditPage() {
    const {
        showAuditDetailModal,
        openAuditDetailModal,
        closeAuditDetailModal,
        listuser,
        setSelectedUser,
        setEndDate,
        setStartDate,
        listActivityLog,
        setSelectedActivityLog,
        selectedActivityLog,
        page,
        totalPages,
        fetchListActivity,
        loading,
        error,

        
    } = useAudit();

    return (
        <div>
            {/* Tiêu đề */}
            <div className="mb-5">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <svg
                        className="w-7 h-7 text-primary-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                    </svg>
                    Nhật ký hoạt động
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    Theo dõi mọi thao tác của nhân viên trong hệ thống
                </p>
            </div>

    

            {/* Hàng 3: Bộ lọc chi tiết */}
            <div className="mb-5 rounded-xl border bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            Nhân viên
                        </label>
                        <select
                            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                            onChange={(e) => {
                            const selectedId = e.target.value;
                            const user = listuser.find(u => u.id.toString() === selectedId);
                            setSelectedUser(user);
                            }}

                            >
                            <option value="">Tất cả nhân viên</option>
                            {listuser.map(user => (
                                <option key={user.id} value={user.id}>
                                {user.fullName}
                                </option>
                            ))}
                        </select>

                        
                    </div>
                    {/* Ngày bắt đầu */}
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            Từ ngày
                        </label>
                        <input 
                            type="date"
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                        />
                        </div>

                        {/* Ngày kết thúc */}
                        <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            Đến ngày
                        </label>
                        <input
                            type="date"
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                        />
                    </div>


                    {/* Nút lọc */}
                    <div className="flex items-end">
                        <button 
                        onClick={() => fetchListActivity(1)}
                        className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 sm:w-auto">
                            Lọc nhật ký
                        </button>
                    </div>
                </div>
                
            </div>
            
            {error && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    <span>{error}</span>
                    <button type="button" onClick={() => fetchListActivity(page)} className="rounded border border-red-300 px-3 py-1 font-semibold hover:bg-red-100">Thử lại</button>
                </div>
            )}
            {loading && <p className="mb-2 text-sm text-gray-500">Đang tải nhật ký…</p>}
            <AuditTable openAuditDetailModal={openAuditDetailModal} listActivityLog={listActivityLog} setSelectedActivityLog={setSelectedActivityLog} page={page} totalPages={totalPages} fetchListActivity ={fetchListActivity } />
            {showAuditDetailModal&&<AuditDetail onClose={closeAuditDetailModal} selectedActivityLog={selectedActivityLog}/>}

        </div>
    );
}
