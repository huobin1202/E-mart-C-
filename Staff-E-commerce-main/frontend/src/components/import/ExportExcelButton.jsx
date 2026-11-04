import { useState } from 'react';
import { exportMasterExcel } from '../../api/importApi';

export default function ExportExcelButton({ type }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setBusy(true); setError('');
    try { await exportMasterExcel(type); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <span><button className="px-3 py-2 border rounded-md bg-white" disabled={busy} onClick={download}>{busy ? 'Đang xuất…' : 'Xuất Excel'}</button>{error && <span role="alert" className="text-red-700">{error}</span>}</span>;
}
