import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Receipt, TrendingDown } from "lucide-react";

export default function AvgTransactionCard({ value, loading, error }) {
  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });

  return (
    <Card className="overflow-hidden border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Transaction</CardTitle>
            <CardDescription className="text-xs font-medium mt-1">{currentMonth}</CardDescription>
          </div>
          <div className="rounded-full bg-blue-100 p-2.5 shadow-sm">
            <Receipt className="h-5 w-5 text-blue-600" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline space-x-2">
          <span className="text-3xl font-bold tracking-tight text-gray-900">
            {loading ? "--" : `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </CardContent>
      <CardFooter className="pt-0 pb-4">
        <div className="flex items-center text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md font-medium">
           <span>Per Sale</span>
        </div>
        <span className="text-xs text-muted-foreground ml-2">average</span>
      </CardFooter>
    </Card>
  );
}
