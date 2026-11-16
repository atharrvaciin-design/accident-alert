import React, { useMemo, useState } from 'react';
import { AccidentReport } from '../types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Calendar,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Activity,
  Layers,
  ArrowUpRight,
  Filter,
} from 'lucide-react';

interface ReportStatusAnalyticsProps {
  reports: AccidentReport[];
  onSelectReport?: (report: AccidentReport) => void;
}

const STATUS_COLORS = {
  Pending: '#f59e0b', // Amber-500
  'In Progress': '#3b82f6', // Blue-500
  Resolved: '#10b981', // Emerald-500
};

export const ReportStatusAnalytics: React.FC<ReportStatusAnalyticsProps> = ({
  reports,
}) => {
  const [chartType, setChartType] = useState<'stacked' | 'grouped' | 'area'>('stacked');
  const [activeStatusFilter, setActiveStatusFilter] = useState<'All' | 'Pending' | 'In Progress' | 'Resolved'>('All');

  // Compute 30-day timeline data
  const {
    dailyData,
    statusTotals,
    total30DayReports,
    resolutionRate,
    peakDay,
    reportsIn30Days,
  } = useMemo(() => {
    const now = new Date();
    // Build array of past 30 days: Day -29 to Day 0
    const dayMap = new Map<
      string,
      {
        dateKey: string;
        displayDate: string;
        shortDate: string;
        Pending: number;
        'In Progress': number;
        Resolved: number;
        total: number;
      }
    >();

    const daysList: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const shortDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const displayDate = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      dayMap.set(dateKey, {
        dateKey,
        displayDate,
        shortDate,
        Pending: 0,
        'In Progress': 0,
        Resolved: 0,
        total: 0,
      });
      daysList.push(dateKey);
    }

    const thirtyDaysAgoTime = new Date(now);
    thirtyDaysAgoTime.setDate(thirtyDaysAgoTime.getDate() - 29);
    thirtyDaysAgoTime.setHours(0, 0, 0, 0);

    const valid30DayReports: AccidentReport[] = [];
    let pendingCount = 0;
    let inProgressCount = 0;
    let resolvedCount = 0;

    reports.forEach((report) => {
      const reportDate = new Date(report.createdAt || 0);
      if (isNaN(reportDate.getTime())) return;

      if (reportDate >= thirtyDaysAgoTime) {
        valid30DayReports.push(report);
        const dateKey = reportDate.toISOString().slice(0, 10);
        const dayEntry = dayMap.get(dateKey);

        const status = report.status || 'Pending';
        if (status === 'Pending') pendingCount++;
        else if (status === 'In Progress') inProgressCount++;
        else if (status === 'Resolved') resolvedCount++;

        if (dayEntry) {
          if (status === 'Pending') dayEntry.Pending += 1;
          else if (status === 'In Progress') dayEntry['In Progress'] += 1;
          else if (status === 'Resolved') dayEntry.Resolved += 1;
          dayEntry.total += 1;
        }
      }
    });

    const series = daysList.map((k) => dayMap.get(k)!);

    // Find peak reporting day
    let peak = { date: 'N/A', count: 0 };
    series.forEach((s) => {
      if (s.total > peak.count) {
        peak = { date: s.displayDate, count: s.total };
      }
    });

    const total = valid30DayReports.length;
    const rate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

    return {
      dailyData: series,
      statusTotals: [
        { name: 'Pending', value: pendingCount, color: STATUS_COLORS.Pending },
        { name: 'In Progress', value: inProgressCount, color: STATUS_COLORS['In Progress'] },
        { name: 'Resolved', value: resolvedCount, color: STATUS_COLORS.Resolved },
      ],
      total30DayReports: total,
      resolutionRate: rate,
      peakDay: peak,
      reportsIn30Days: valid30DayReports,
    };
  }, [reports]);

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pendingVal = payload.find((p: any) => p.dataKey === 'Pending')?.value || 0;
      const inProgressVal = payload.find((p: any) => p.dataKey === 'In Progress')?.value || 0;
      const resolvedVal = payload.find((p: any) => p.dataKey === 'Resolved')?.value || 0;
      const totalVal = Number(pendingVal) + Number(inProgressVal) + Number(resolvedVal);

      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs backdrop-blur-md min-w-[170px]">
          <div className="font-bold text-slate-200 border-b border-slate-700/80 pb-1.5 mb-2 flex items-center justify-between">
            <span>{label}</span>
            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
              Total: {totalVal}
            </span>
          </div>
          <div className="space-y-1.5 font-medium">
            <div className="flex items-center justify-between text-amber-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Pending
              </span>
              <span className="font-bold">{pendingVal}</span>
            </div>
            <div className="flex items-center justify-between text-blue-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                In Progress
              </span>
              <span className="font-bold">{inProgressVal}</span>
            </div>
            <div className="flex items-center justify-between text-emerald-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Resolved
              </span>
              <span className="font-bold">{resolvedVal}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-5">
      {/* 30-Day Metric Highlights Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total in 30 Days */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">30-Day Total</span>
            <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {total30DayReports}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">reports</span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Last 30 consecutive calendar days
          </p>
        </div>

        {/* Pending Ratio */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Pending (30d)</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-600 dark:text-amber-400">
              {statusTotals.find((s) => s.name === 'Pending')?.value || 0}
            </span>
            {total30DayReports > 0 && (
              <span className="text-xs font-semibold text-amber-500">
                ({Math.round(((statusTotals.find((s) => s.name === 'Pending')?.value || 0) / total30DayReports) * 100)}%)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Awaiting emergency dispatch
          </p>
        </div>

        {/* In Progress Ratio */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">In Progress (30d)</span>
            <Activity className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-blue-600 dark:text-blue-400">
              {statusTotals.find((s) => s.name === 'In Progress')?.value || 0}
            </span>
            {total30DayReports > 0 && (
              <span className="text-xs font-semibold text-blue-500">
                ({Math.round(((statusTotals.find((s) => s.name === 'In Progress')?.value || 0) / total30DayReports) * 100)}%)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Responders active on field
          </p>
        </div>

        {/* Resolution Rate */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Resolution Rate</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {resolutionRate}%
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              ({statusTotals.find((s) => s.name === 'Resolved')?.value || 0} closed)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Resolved incidents efficiency
          </p>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Timeline Chart (8 Cols) */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            {/* Header with Title and Mode Switchers */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  30-Day Status Distribution Timeline
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Daily breakdown of Pending, In Progress, and Resolved incident reports
                </p>
              </div>

              {/* Chart Format Switcher */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setChartType('stacked')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    chartType === 'stacked'
                      ? 'bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Stacked Bar Chart"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Stacked</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('grouped')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    chartType === 'grouped'
                      ? 'bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Grouped Bar Chart"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Bars</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('area')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    chartType === 'area'
                      ? 'bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Area Trend Chart"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Trend</span>
                </button>
              </div>
            </div>

            {/* Recharts Canvas */}
            <div className="h-72 w-full pt-4">
              {chartType === 'area' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={STATUS_COLORS.Pending} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={STATUS_COLORS.Pending} stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorInProgress" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={STATUS_COLORS['In Progress']} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={STATUS_COLORS['In Progress']} stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={STATUS_COLORS.Resolved} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={STATUS_COLORS.Resolved} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis
                      dataKey="shortDate"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      interval={4}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: '11px', fontWeight: 600 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Pending"
                      stroke={STATUS_COLORS.Pending}
                      fillOpacity={1}
                      fill="url(#colorPending)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="In Progress"
                      stroke={STATUS_COLORS['In Progress']}
                      fillOpacity={1}
                      fill="url(#colorInProgress)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="Resolved"
                      stroke={STATUS_COLORS.Resolved}
                      fillOpacity={1}
                      fill="url(#colorResolved)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                    <XAxis
                      dataKey="shortDate"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      interval={4}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: '11px', fontWeight: 600 }}
                    />
                    <Bar
                      dataKey="Pending"
                      fill={STATUS_COLORS.Pending}
                      stackId={chartType === 'stacked' ? 'a' : undefined}
                      radius={chartType === 'stacked' ? [0, 0, 0, 0] : [3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="In Progress"
                      fill={STATUS_COLORS['In Progress']}
                      stackId={chartType === 'stacked' ? 'a' : undefined}
                      radius={chartType === 'stacked' ? [0, 0, 0, 0] : [3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="Resolved"
                      fill={STATUS_COLORS.Resolved}
                      stackId={chartType === 'stacked' ? 'a' : undefined}
                      radius={chartType === 'stacked' ? [3, 3, 0, 0] : [3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Footer note & Peak Info */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-time Firestore dynamic sync
            </span>
            {peakDay.count > 0 && (
              <span className="text-slate-600 dark:text-slate-300 font-semibold">
                Peak: <strong className="text-blue-600 dark:text-blue-400">{peakDay.count} reports</strong> on {peakDay.date}
              </span>
            )}
          </div>
        </div>

        {/* Status Distribution Donut & Breakdown (4 Cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Status Share
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Proportion of reports in 30 days
              </p>
            </div>

            {/* Donut Chart */}
            <div className="h-44 w-full relative flex items-center justify-center my-2">
              {total30DayReports === 0 ? (
                <div className="text-center text-xs text-slate-400">
                  <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-slate-400" />
                  No reports logged in the past 30 days
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusTotals}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {statusTotals.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, name: any) => [
                          `${value} reports (${Math.round((Number(value) / total30DayReports) * 100)}%)`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Text in Donut */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-black text-slate-900 dark:text-white leading-none">
                      {total30DayReports}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      Total
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Status Breakdown Legend & Percentages */}
            <div className="space-y-2 mt-2">
              {statusTotals.map((item) => {
                const count = item.value;
                const percentage = total30DayReports > 0 ? Math.round((count / total30DayReports) * 100) : 0;
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-md shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-black text-slate-900 dark:text-white">{count}</span>
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                        {percentage}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            Click on any status filter on top to drill down into corresponding incident cards.
          </div>
        </div>
      </div>
    </div>
  );
};
