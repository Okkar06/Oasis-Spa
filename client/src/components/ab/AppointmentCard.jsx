/*
 * TodayAppointmentsCard.jsx  (refactored)
 * -------------------------------------------------------------------
 * Dashboard card that fetches today’s appointment count directly from
 * the API — no Zustand store.  Keeps its own local loading / error
 * state and re-fetches whenever the `date` prop changes.
 *
 * Author: Arkar Phyo
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import api from "@/services/api";

export default function TodayAppointmentsCard({ date }) {
  // ---------------------------------------------------------------------
  // Resolve target date (yyyy-mm-dd)
  // ---------------------------------------------------------------------
  const targetDate = date || new Date().toISOString().split("T")[0];

  // ---------------------------------------------------------------------
  // Local state: count / loading / error
  // ---------------------------------------------------------------------
  const [count,   setCount]   = useState(null); // number | null
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null); // string | null

  // ---------------------------------------------------------------------
  // Fetch count whenever date changes
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/ab/count/${targetDate}`);
        if (!cancelled) setCount(res.data?.count ?? 0);
      } catch (err) {
        if (!cancelled) {
          const msg = err?.response?.data?.message || err.message || "Failed to fetch count";
          setError(msg);
          setCount(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCount();
    return () => {
      cancelled = true; // prevent state updates after unmount
    };
  }, [targetDate]);

  const isLoading = loading || count == null;
  const linkHref  = `/appointments?date=${targetDate}`;

  return (
    <Card className="overflow-hidden border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Appointments</CardTitle>
            <CardDescription className="text-xs font-medium mt-1">{targetDate}</CardDescription>
          </div>
          <div className="rounded-full bg-purple-100 p-2.5 shadow-sm">
            <Calendar className="h-5 w-5 text-purple-600" />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-baseline space-x-2">
          <span className="text-3xl font-bold tracking-tight text-gray-900">{isLoading ? "--" : count}</span>
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </CardContent>

      <CardFooter className="pt-0 pb-4">
        <Button
          asChild
          variant="link"
          className="p-0 h-auto text-purple-600 hover:text-purple-700"
          disabled={isLoading || !!error}
        >
          <Link to={linkHref} className="flex items-center text-xs font-medium">
            <span>View Schedule</span>
            <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}