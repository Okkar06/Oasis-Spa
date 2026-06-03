/*
 * Home.jsx (Dashboard landing page)
 * -------------------------------------------------------------------
 */

import React, { useEffect, useState } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import TodayAppointmentsCard from '@/components/ab/AppointmentCard';
import MonthlyRevenueCard from '@/components/dashboard/MonthlyRevenueCard';
import TopServicesCard from '@/components/dashboard/TopServicesCard';
import RevenueTrendChart from '@/components/dashboard/RevenueTrendChart';
import AvgTransactionCard from '@/components/dashboard/AvgTransactionCard';
import WelcomeHeader from '@/components/dashboard/WelcomeHeader';
import useAuth from '@/hooks/useAuth';
import api from '@/services/api';
import { startCase } from 'lodash';

export default function Home() {
  const { user } = useAuth();
  // Format name: use 'name' if available, otherwise capitalize 'username', fallback to undefined (WelcomeHeader defaults to "Admin")
  const displayName = user?.name || (user?.username ? startCase(user.username) : undefined);
  
  // yyyy-mm-dd format for today; pass as prop for explicitness
  const today = new Date().toISOString().split('T')[0];

  const [stats, setStats] = useState({ 
    monthlyRevenue: 0, 
    avgTransactionValue: 0,
    topServices: [], 
    revenueTrend: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/dashboard/stats');
        setStats(res.data);
      } catch (err) {
        console.error("Failed to fetch dashboard stats", err);
        setError("Failed to load statistics");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="[--header-height:calc(theme(spacing.14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset>
            <div className="flex flex-1 flex-col p-6 bg-background min-h-screen">
              {/* Welcome Header */}
              <WelcomeHeader name={displayName} />
              
              <div className="flex flex-col gap-6">
                {/* Top Row: Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Dynamic appointments card */}
                  <TodayAppointmentsCard date={today} />
                  <MonthlyRevenueCard revenue={stats.monthlyRevenue} loading={loading} error={error} />
                  <AvgTransactionCard value={stats.avgTransactionValue} loading={loading} error={error} />
                </div>

                {/* Bottom Row: Charts & Lists */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
                  {/* Revenue Trend - Takes up 2/3 space */}
                  <RevenueTrendChart data={stats.revenueTrend} loading={loading} error={error} />
                  
                  {/* Top Services - Takes up 1/3 space */}
                  <TopServicesCard services={stats.topServices} loading={loading} error={error} />
                </div>
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
