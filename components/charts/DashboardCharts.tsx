"use client";

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const AXIS = { fontSize: 11 };

export function DashboardCharts({
  callsVsAppts,
  costSeries,
}: {
  callsVsAppts: { label: string; calls: number; appts: number }[];
  costSeries: { label: string; cost: number }[];
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card card-pad">
        <h3 className="text-sm font-semibold mb-3 text-surface-700">Llamadas frente a citas</h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={callsVsAppts} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="text-surface-200" />
              <XAxis dataKey="label" tick={AXIS} />
              <YAxis tick={AXIS} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="calls" name="Llamadas" stroke="var(--chart-a)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="appts" name="Citas" stroke="var(--chart-b)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card card-pad">
        <h3 className="text-sm font-semibold mb-3 text-surface-700">Coste por tramo ($)</h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={costSeries} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="text-surface-200" />
              <XAxis dataKey="label" tick={AXIS} />
              <YAxis tick={AXIS} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, "Coste"]} />
              <Bar dataKey="cost" name="Coste" fill="var(--chart-cost)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}