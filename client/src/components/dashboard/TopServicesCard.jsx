import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Medal } from "lucide-react";

export default function TopServicesCard({ services, loading, error }) {
  // Find max count for relative bar width
  const maxCount = services && services.length > 0 ? Math.max(...services.map(s => s.count)) : 0;

  return (
    <Card className="col-span-1 md:col-span-1 h-full shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
            <div>
                <CardTitle className="text-lg font-semibold text-gray-800">Top Services</CardTitle>
                <CardDescription className="text-xs mt-1">Most popular in last 30 days</CardDescription>
            </div>
            <Medal className="h-5 w-5 text-amber-500" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
           <div className="space-y-4">
             {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                </div>
             ))}
           </div>
        ) : error ? (
            <p className="text-xs text-red-500">{error}</p>
        ) : services && services.length > 0 ? (
          <div className="space-y-4">
            {services.map((service, index) => {
                const percentage = maxCount > 0 ? (service.count / maxCount) * 100 : 0;
                return (
                    <div key={index} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                                    index === 0 ? 'bg-amber-100 text-amber-700' : 
                                    index === 1 ? 'bg-gray-100 text-gray-700' : 
                                    index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-700'
                                }`}>
                                    {index + 1}
                                </span>
                                <span className="font-medium text-gray-700 truncate max-w-[150px]" title={service.serviceName}>
                                    {service.serviceName}
                                </span>
                            </div>
                            <span className="font-semibold text-gray-900">{service.count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    </div>
                );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
             <p className="text-sm">No sales data available yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
