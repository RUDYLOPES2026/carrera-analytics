import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import BioDashboard from "./pages/BioDashboard";

function Router() {
  return (
    // Hash routing (#/bio) para funcionar no GitHub Pages sem 404 em refresh
    <WouterRouter hook={useHashLocation}>
      <Switch>
        <Route path={"/"} component={Dashboard} />
        <Route path={"/bio"} component={BioDashboard} />
        <Route path={"/lps"} component={BioDashboard} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
