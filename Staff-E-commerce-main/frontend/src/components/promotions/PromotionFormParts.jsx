// Shared layout pieces for the promotion create/edit dialogs (layout only, no business logic).

export function FormSection({ title, children, className = "" }) {
  return (
    <fieldset className={`min-w-0 space-y-3 rounded-lg border border-gray-200 p-3 ${className}`}>
      <legend className="px-1 text-sm font-semibold text-gray-900">{title}</legend>
      {children}
    </fieldset>
  );
}

export function Field({ label, htmlFor, hint, className = "", children }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>;
}
