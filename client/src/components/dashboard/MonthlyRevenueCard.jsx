import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DollarSign, TrendingUp, ArrowUpRight } from "lucide-react";

export default function MonthlyRevenueCard({ revenue, loading, error }) {
  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <Card className="overflow-hidden border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Revenue</CardTitle>
            <CardDescription className="text-xs font-medium mt-1">{currentMonth}</CardDescription>
          </div>
          <div className="rounded-full bg-emerald-100 p-2.5 shadow-sm">
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline space-x-2">
          <span className="text-3xl font-bold tracking-tight text-gray-900">
            {loading ? "--" : `$${Number(revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </CardContent>
      <CardFooter className="pt-0 pb-4">
        <div className="flex items-center text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md font-medium">
           <TrendingUp className="h-3 w-3 mr-1" />
           <span>On track</span>
        </div>
        <span className="text-xs text-muted-foreground ml-2">vs last month</span>
      </CardFooter>
    </Card>
  );
}
