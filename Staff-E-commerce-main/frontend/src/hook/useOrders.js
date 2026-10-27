import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../api/apiClient";

export const useOrders = () => {
  const [currentOrder, setCurrentOrder] = useState(null);
  const [listOrders, setListOrders] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedOrderType, setSelectedOrderType] = useState("");
  const [selectedStartDate, setSelectedStartDate] = useState("");
  const [selectedEndDate, setSelectedEndDate] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const latestRequest = useRef(0);
  const detailRequest = useRef(0);
  const invalidDates = selectedStartDate && selectedEndDate && selectedStartDate > selectedEndDate;
  const loadOrdersAdvanced = useCallback(async ({ silent = false } = {}) => {
    const sequence = ++latestRequest.current;
    if (invalidDates) { if (!silent) setLoading(false); return; }
    const params = new URLSearchParams({ pageNumber: currentPage, pageSize: 10 });
    if (selectedStatus) params.set("status", selectedStatus);
    if (selectedOrderType) params.set("orderType", selectedOrderType);
    if (searchKeyword.trim()) params.set("search", searchKeyword.trim());
    if (selectedStartDate) params.set("startDate", selectedStartDate);
    if (selectedEndDate) params.set("endDate", selectedEndDate);
    if (!silent) setLoading(true);
    setError("");
    try {
      const result = await request(`/orders/search?${params}`);
      if (sequence !== latestRequest.current) return;
      const pages = Math.max(1, result.totalPages || 1);
      setListOrders(result.items || []); setTotalPages(pages);
      if (currentPage > pages) setCurrentPage(pages);
    } catch (e) { if (sequence === latestRequest.current) setError(e.message || "Không thể tải đơn hàng."); }
    finally { if (sequence === latestRequest.current) setLoading(false); }
  }, [currentPage, selectedStatus, selectedOrderType, searchKeyword, selectedStartDate, selectedEndDate, invalidDates]);
  useEffect(() => { const requests = latestRequest; loadOrdersAdvanced(); return () => { requests.current++; }; }, [loadOrdersAdvanced]);
  const showOrderById = useCallback(async (id) => {
    const sequence = ++detailRequest.current;
    setOpening(true); setError(""); setCurrentOrder(null);
    try {
      const [order, items] = await Promise.all([request(`/orders/${id}`), request(`/orders/${id}/items`)]);
      if (sequence === detailRequest.current) setCurrentOrder({ ...order, items });
    } catch (e) { if (sequence === detailRequest.current) setError(e.message || "Không thể mở chi tiết đơn."); }
    finally { if (sequence === detailRequest.current) setOpening(false); }
  }, []);
  return {
    currentOrder, listOrders, currentPage, totalPages, setCurrentPage,
    selectedStatus, setSelectedStatus, selectedStartDate, setSelectedStartDate,
    selectedOrderType, setSelectedOrderType,
    selectedEndDate, setSelectedEndDate, searchKeyword, setSearchKeyword,
    loading, opening, error: invalidDates ? "Ngày bắt đầu không được lớn hơn ngày kết thúc." : error,
    loadOrdersAdvanced, showOrderById,
    closeOrderModal: () => { detailRequest.current++; setCurrentOrder(null); setOpening(false); },
  };
};
