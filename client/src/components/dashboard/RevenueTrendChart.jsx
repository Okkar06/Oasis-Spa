import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, XAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function RevenueTrendChart({ data, loading, error }) {
  // Format date for X-axis (e.g., "Jan 01")
  const formatXAxis = (tickItem) => {
    const date = new Date(tickItem);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 p-2 rounded shadow-sm text-sm">
          <p className="font-semibold">{new Date(label).toLocaleDateString()}</p>
          <p className="text-green-600">
            Revenue: ${Number(payload[0].value).toFixed(2)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="col-span-1 md:col-span-2 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Last 7 Days</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pl-0">
        <div className="h-[300px] w-full">
          {loading ? (
            <div className="h-full w-full flex items-center justify-center bg-gray-50 rounded">
               <span className="text-gray-400">Loading chart...</span>
            </div>
          ) : error ? (
            <div className="h-full w-full flex items-center justify-center bg-gray-50 rounded">
               <span className="text-red-400">Failed to load data</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{
                  top: 10,
                  right: 30,
                  left: 0,
                  bottom: 0,
                }}
              >
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatXAxis} 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  dy={10}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
