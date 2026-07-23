import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider } from '@/context/AuthContext';

import NotFound from '@/pages/not-found';
import LandingPage from '@/pages/landing';
import LoginPage from '@/pages/login';
import ManagerDashboard from '@/pages/manager';
import ResidentDashboard from '@/pages/resident';
import TechnicianDashboard from '@/pages/technician';
import PrintWorkOrder from '@/pages/print-work-order';
import PrintMonthly from '@/pages/print-monthly';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    }
  }
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/manager" component={ManagerDashboard} />
      <Route path="/resident" component={ResidentDashboard} />
      <Route path="/technician" component={TechnicianDashboard} />
      <Route path="/print/work-order/:requestId" component={PrintWorkOrder} />
      <Route path="/print/monthly" component={PrintMonthly} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
