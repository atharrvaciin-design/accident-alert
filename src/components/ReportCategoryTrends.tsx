import React, { useMemo } from 'react';
import { AccidentReport } from '../types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { TrendingUp, Car, Footprints, Construction, AlertTriangle, ShieldAlert } from 'lucide-react';

interface ReportCategoryTrendsProps {
  reports: AccidentReport[];
}

export const ReportCategoryTrends: React.FC<ReportCategoryTrendsProps> = ({ reports }) => {
  const { chartData, categoryTotals, total7Days, peakCategory } = useMemo(() => {
    const now = new Date();
    const days: { [dateKey: string]: { day: string; date: string; Vehicle: number; Pedestrian: number; Infrastructure: number; Other: number; total: number } } = {};

    // 7 days back from today
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
      const displayDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      days[dateKey] = {
        day: `${dayLabel} (${displayDate})`,
        date: dateKey,
        Vehicle: 0,
        Pedestrian: 0,
        Infrastructure: 0,
        Other: 0,
        total: 0,
      };
    }

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const totals = { Vehicle: 0, Pedestrian: 0, Infrastructure: 0, Other: 0 };
    let sum7Days = 0;

    reports.forEach((r) => {
      const reportDate = new Date(r.createdAt || Date.now());
      if (reportDate >= sevenDaysAgo) {
        const key = reportDate.toISOString().slice(0, 10);
        const cat = r.category || 'Vehicle';
        const targetCategory =
          cat === 'Vehicle'
            ? 'Vehicle'
            : cat === 'Pedestrian'
            ? 'Pedestrian'
            : cat === 'Infrastructure'
            ? 'Infrastructure'
            : 'Other';

        if (days[key]) {
          days[key][targetCategory] += 1;
          days[key].total += 1;
        }
        totals[targetCategory] += 1;
        sum7Days += 1;
      }
    });

    const entries = Object.entries(totals);
    entries.sort((a, b) => b[1] - a[1]);
    const topCat = entries[0]?.[1] > 0 ? entries[0][0] : 'Vehicle';

    return {
      chartData: Object.values(days),
      categoryTotals: totals,
      total7Days: sum7Days,
      peakCategory: topCat,
    };
  }, [reports]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors space-y-4">
      {/* Top Title & Mini KPIs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400">
              <TrendingUp className="w-4 h-4" />
            </span>
            <h3 className="font-extrabold text-sm text-blue-950 dark:text-white uppercase tracking-wide">
              7-Day Report Trends by Category
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Volume of accident emergency reports categorized for dispatch resource planning
          </p>
        </div>

        {/* Totals Badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl font-bold text-slate-700 dark:text-slate-300">
            {total7Days} Total Alerts (Past 7 Days)
          </span>
          <span className="text-xs bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 font-extrabold px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900">
            Top: {peakCategory}
          </span>
        </div>
      </div>

      {/* 4 Category Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Car className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Vehicle</span>
            <span className="text-base font-black text-slate-800 dark:text-white">{categoryTotals.Vehicle}</span>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Footprints className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Pedestrian</span>
            <span className="text-base font-black text-slate-800 dark:text-white">{categoryTotals.Pedestrian}</span>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Construction className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Infrastructure</span>
            <span className="text-base font-black text-slate-800 dark:text-white">{categoryTotals.Infrastructure}</span>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Multiple / Other</span>
            <span className="text-base font-black text-slate-800 dark:text-white">{categoryTotals.Other}</span>
          </div>
        </div>
      </div>

      {/* Recharts Bar Chart */}
      <div className="h-56 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
            <Bar dataKey="Vehicle" name="Vehicle Collision" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Pedestrian" name="Pedestrian Hit" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Infrastructure" name="Road Infrastructure" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Other" name="Multi / Other" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
