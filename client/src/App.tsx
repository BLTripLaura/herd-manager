import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppProvider, Shell } from "@/components/shell";
import Today from "@/pages/today";
import Herd from "@/pages/herd";
import AnimalPage from "@/pages/animal";
import Batch from "@/pages/batch";
import Meds from "@/pages/meds";
import BreedingPlanPage from "@/pages/breeding-plan";
import BreedingPage from "@/pages/breeding";
import MilkPage from "@/pages/milk";
import DataPage from "@/pages/data";
import Pastures from "@/pages/pastures";
import Phones from "@/pages/phones";
import Reports from "@/pages/reports";
import TankPage from "@/pages/tank";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthGate } from "@/components/auth";

function AppRouter() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Today} />
        <Route path="/herd" component={Herd} />
        <Route path="/herd/:view" component={Herd} />
        <Route path="/animal/:id" component={AnimalPage} />
        <Route path="/batch" component={Batch} />
        <Route path="/meds" component={Meds} />
        <Route path="/breeding" component={BreedingPage} />
        <Route path="/breeding/plan" component={BreedingPlanPage} />
        <Route path="/pastures" component={Pastures} />
        <Route path="/phones" component={Phones} />
        <Route path="/tank" component={TankPage} />
        <Route path="/milk" component={MilkPage} />
        <Route path="/reports" component={Reports} />
        <Route path="/data" component={DataPage} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <ErrorBoundary><AuthGate><AppRouter /></AuthGate></ErrorBoundary>
          </Router>
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
