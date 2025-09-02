'use client';

import { useEffect, useState } from 'react';
import Report from './Report';

export default function MonthlyReportView({ month, token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!month) return;
      setLoading(true);
      setError(null);
      try {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reports/monthly/${month}`, { headers });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.detail || 'Failed to load monthly report');
        }
        const body = await res.json();
        setData(body);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [month, token]);

  if (loading) {
    return <div className="p-6 text-gray-600">Loading...</div>;
  }
  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }
  if (!data) return null;

  return (
    <div className="mt-4">
      <Report data={data} />
    </div>
  );
}


