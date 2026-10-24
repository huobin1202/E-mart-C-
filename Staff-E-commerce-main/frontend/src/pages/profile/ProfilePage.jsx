import React, { useEffect, useState } from "react";
import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
} from "../../api/apiClient";

const emptyProfile = {
  username: "",
  email: "",
  fullName: "",
};

const emptyPassword = {
  currentPassword: "",
  newPassword: "",
  confirmNewPassword: "",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
        <button
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
          onClick={onClose}
        >
          ×
        </button>
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [form, setForm] = useState(emptyProfile);
  const [passwordForm, setPasswordForm] = useState(emptyPassword);
  const [passwordAlert, setPasswordAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    setAlert(null);
    try {
      const data = await getMyProfile();
      setForm({
        username: data.username ?? "",
        email: data.email ?? "",
        fullName: data.fullName ?? "",
      });
    } catch (err) {
      setAlert({
        type: "error",
        message: err.message || "Không thể tải thông tin cá nhân.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    const trimmedUsername = form.username.trim();
    const trimmedEmail = form.email.trim();

    if (trimmedUsername.length < 3) {
      setAlert({
        type: "error",
        message: "Username phải có ít nhất 3 ký tự.",
      });
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setAlert({
        type: "error",
        message: "Email không hợp lệ.",
      });
      return;
    }

    setSaving(true);
    setAlert(null);
    try {
      const payload = {
        username: trimmedUsername,
        email: trimmedEmail,
        fullName: form.fullName ? form.fullName.trim() : "",
      };
      await updateMyProfile(payload);
      setAlert({
        type: "success",
        message: "Thông tin cá nhân đã được cập nhật.",
      });
    } catch (err) {
      setAlert({
        type: "error",
        message: err.message || "Cập nhật thông tin thất bại.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordAlert(null);
    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordAlert({
        type: "error",
        message: "Mật khẩu xác nhận không khớp.",
      });
      return;
    }
    setPasswordSaving(true);
    setAlert(null);
    try {
      await changeMyPassword(passwordForm);
      setAlert({
        type: "success",
        message: "Mật khẩu đã được thay đổi.",
      });
      setPasswordForm(emptyPassword);
      setShowPasswordModal(false);
    } catch (err) {
      console.log(err)
      setPasswordAlert({
        type: "error",
        message: err.message || "Đổi mật khẩu thất bại.",
      });
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Thông tin cá nhân</h1>
        <p className="text-sm text-gray-500">
          Cập nhật thông tin hồ sơ và bảo vệ tài khoản của bạn.
        </p>
      </div>

      {alert && (
        <div
          className={`rounded-md px-4 py-2 text-sm ${
            alert.type === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {alert.message}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        {loading ? (
          <p className="text-sm text-gray-500">Đang tải...</p>
        ) : (
          <form className="space-y-4" onSubmit={handleProfileSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                type="text"
                name="username"
                className="mt-1 w-full rounded-md border px-3 py-2 bg-gray-100 cursor-not-allowed"
                value={form.username}
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                name="email"
                className="mt-1 w-full rounded-md border px-3 py-2 bg-gray-100 cursor-not-allowed"
                value={form.email}
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Họ tên
              </label>
              <input
                type="text"
                name="fullName"
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={form.fullName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, fullName: e.target.value }))
                }
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="text-sm text-primary-600 hover:text-primary-700"
              onClick={() => {
                  setPasswordAlert(null);
                  setPasswordForm(emptyPassword);
                  setShowCurrentPassword(false);
                  setShowNewPassword(false);
                  setShowPasswordModal(true);
                }}
              >
                Đổi mật khẩu
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-primary-600 text-white disabled:opacity-50 hover:bg-primary-700"
                disabled={saving}
              >
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        )}
      </div>

      {showPasswordModal && (
        <Modal
          title="Đổi mật khẩu"
          onClose={() => {
            setShowPasswordModal(false);
            setPasswordAlert(null);
            setPasswordForm(emptyPassword);
            setShowCurrentPassword(false);
            setShowNewPassword(false);
          }}
        >
          <form className="space-y-4" onSubmit={handlePasswordSubmit}>
            {passwordAlert && (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  passwordAlert.type === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {passwordAlert.message}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Mật khẩu hiện tại
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  name="currentPassword"
                  className="mt-1 w-full rounded-md border px-3 py-2 pr-10"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      currentPassword: e.target.value,
                    }))
                  }
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowCurrentPassword((s) => !s)}
                  aria-label={showCurrentPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showCurrentPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Mật khẩu mới
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  name="newPassword"
                  className="mt-1 w-full rounded-md border px-3 py-2 pr-10"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      newPassword: e.target.value,
                    }))
                  }
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowNewPassword((s) => !s)}
                  aria-label={showNewPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showNewPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Xác nhận mật khẩu mới
              </label>
                <input
                type="password"
                  name="confirmNewPassword"
                className="mt-1 w-full rounded-md border px-3 py-2"
                  value={passwordForm.confirmNewPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      confirmNewPassword: e.target.value,
                    }))
                  }
                  required
                  minLength={6}
                />

            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded-md border"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordAlert(null);
                }}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-primary-600 text-white disabled:opacity-50 hover:bg-primary-700"
                disabled={passwordSaving}
              >
                {passwordSaving ? "Đang lưu..." : "Đổi mật khẩu"}
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
}


