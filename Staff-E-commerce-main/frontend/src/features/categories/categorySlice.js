import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
} from "../../api/categoryApi";

// Async thunks
export const fetchCategories = createAsyncThunk(
  "categories/fetchCategories",
  async (
    { page = 1, pageSize = 5, search = "", status = "all" },
    { rejectWithValue }
  ) => {
    try {
      const data = await getCategories(page, pageSize, search, status);
      return data;
    } catch (error) {
      return rejectWithValue(error.message || "Error fetching categories");
    }
  }
);

export const fetchCategoryById = createAsyncThunk(
  "categories/fetchCategoryById",
  async (categoryId, { rejectWithValue }) => {
    try {
      const data = await getCategoryById(categoryId);
      return data;
    } catch (error) {
      return rejectWithValue(error.message || "Error fetching category");
    }
  }
);

export const createNewCategory = createAsyncThunk(
  "categories/createNewCategory",
  async (categoryData, { rejectWithValue }) => {
    try {
      const data = await createCategory(categoryData);
      return data;
    } catch (error) {
      return rejectWithValue(error.message || "Error creating category");
    }
  }
);

export const updateCategoryInfo = createAsyncThunk(
  "categories/updateCategoryInfo",
  async ({ categoryId, categoryData }, { rejectWithValue }) => {
    try {
      const data = await updateCategory(categoryId, categoryData);
      return data;
    } catch (error) {
      return rejectWithValue(error.message || "Error updating category");
    }
  }
);

export const toggleStatus = createAsyncThunk(
  "categories/toggleStatus",
  async ({ categoryId, isActive }, { rejectWithValue }) => {
    try {
      const data = await toggleCategoryStatus(categoryId, isActive);
      return data;
    } catch (error) {
      return rejectWithValue(error.message || "Error toggling status");
    }
  }
);

export const removeCategory = createAsyncThunk(
  "categories/removeCategory",
  async (categoryId, { rejectWithValue }) => {
    try {
      await deleteCategory(categoryId);
      return { id: categoryId };
    } catch (error) {
      return rejectWithValue(error.message || "Error deleting category");
    }
  }
);

const initialState = {
  items: [],
  currentCategory: null,
  loading: false,
  error: null,
  successMessage: null,
  pagination: {
    currentPage: 1,
    pageSize: 5,
    totalItems: 0,
    totalPages: 0,
  },
  filters: {
    search: "",
    status: "all",
  },
};

const categorySlice = createSlice({
  name: "categories",
  initialState,
  reducers: {
    setCurrentPage: (state, action) => {
      state.pagination.currentPage = action.payload;
    },
    setSearchTerm: (state, action) => {
      state.filters.search = action.payload;
      state.pagination.currentPage = 1;
    },
    setStatusFilter: (state, action) => {
      state.filters.status = action.payload;
      state.pagination.currentPage = 1;
    },
    resetFilters: (state) => {
      state.filters.search = "";
      state.filters.status = "all";
      state.pagination.currentPage = 1;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearSuccess: (state) => {
      state.successMessage = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch Categories
    builder
      .addCase(fetchCategories.pending, (state, action) => {
        state.listRequestId = action.meta.requestId;
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        if (state.listRequestId !== action.meta.requestId) return;
        state.loading = false;
        state.items = action.payload.items || [];
        state.pagination = {
          currentPage: action.payload.currentPage || 1,
          pageSize: state.pagination.pageSize || 5,
          totalItems: action.payload.totalItems || 0,
          totalPages: action.payload.totalPages || 0,
        };
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        if (state.listRequestId !== action.meta.requestId) return;
        state.loading = false;
        state.error = action.payload;
      });

    // Fetch Category By ID
    builder
      .addCase(fetchCategoryById.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchCategoryById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentCategory = action.payload?.data ?? action.payload;
      })
      .addCase(fetchCategoryById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Create Category
    builder
      .addCase(createNewCategory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createNewCategory.fulfilled, (state, action) => {
        state.loading = false;
        state.successMessage = "Tạo danh mục thành công";
        const category = action.payload?.data ?? action.payload;
        if (category?.id) {
          state.items = [category, ...state.items.filter((item) => item.id !== category.id)];
          state.pagination.totalItems += 1;
        }
      })
      .addCase(createNewCategory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Update Category
    builder
      .addCase(updateCategoryInfo.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateCategoryInfo.fulfilled, (state, action) => {
        state.loading = false;
        state.successMessage = "Cập nhật danh mục thành công";
        const category = action.payload?.data ?? action.payload;
        const index = state.items.findIndex((item) => item.id === category?.id);
        if (index !== -1) {
          state.items[index] = category;
        }
        state.currentCategory = category;
      })
      .addCase(updateCategoryInfo.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Toggle Status
    builder
      .addCase(toggleStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(toggleStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.successMessage = "Cập nhật trạng thái thành công";
        const categoryId = action.payload.id || action.payload.data?.id;
        const index = state.items.findIndex((item) => item.id === categoryId);
        if (index !== -1) {
          state.items[index] = action.payload.data || action.payload;
        }
      })
      .addCase(toggleStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Delete Category
    builder
      .addCase(removeCategory.pending, (state) => {
        state.loading = true;
      })
      .addCase(removeCategory.fulfilled, (state, action) => {
        state.loading = false;
        state.successMessage = "Xóa danh mục thành công";
        const categoryId = action.payload?.id ?? action.meta.arg;
        const hadCategory = state.items.some((item) => item.id === categoryId);
        state.items = state.items.filter((item) => item.id !== categoryId);
        if (hadCategory) state.pagination.totalItems = Math.max(0, state.pagination.totalItems - 1);
      })
      .addCase(removeCategory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const {
  setCurrentPage,
  setSearchTerm,
  setStatusFilter,
  resetFilters,
  clearError,
  clearSuccess,
} = categorySlice.actions;
export default categorySlice.reducer;
