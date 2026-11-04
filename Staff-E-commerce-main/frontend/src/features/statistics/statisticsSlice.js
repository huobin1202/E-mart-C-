import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  getRevenueByPeriod,
  getBestSellers,
  getLowStockProducts,
  getOrderStats,
} from '../../api/statisticsApi';

export const fetchDashboard = createAsyncThunk('statistics/fetchDashboard', async (_, { rejectWithValue }) => {
  try {
    const [revenue, bestSellers, lowStock, orderStats] = await Promise.all([
      getRevenueByPeriod(7),
      getBestSellers(5, 7),
      getLowStockProducts(10),
      getOrderStats(7),
    ]);
    return { revenue, bestSellers, lowStock, orderStats };
  } catch (err) {
    return rejectWithValue(err.message || 'Không thể tải dashboard');
  }
});

const initialState = {
  overview: null,
  revenue: [],
  bestSellers: [],
  lowStock: [],
  orderStats: null,
  loading: false,
  error: null,
};

const statisticsSlice = createSlice({
  name: 'statistics',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.loading = false;
        Object.assign(state, action.payload);
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Lỗi dashboard';
      });
  },
});

export default statisticsSlice.reducer;
