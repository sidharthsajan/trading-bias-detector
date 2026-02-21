import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import AutoTranslate from "@/components/AutoTranslate";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import UploadTrades from "./pages/UploadTrades";
import BiasAnalysis from "./pages/BiasAnalysis";
import RiskProfile from "./pages/RiskProfile";
import AICoach from "./pages/AICoach";
import EmotionalTracker from "./pages/EmotionalTracker";
import Portfolio from "./pages/Portfolio";
import Settings from "./pages/Settings";
import Trades from "./pages/Trades";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <LanguageProvider>
        <BrowserRouter>
          <AutoTranslate />
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/upload" element={<ProtectedRoute><UploadTrades /></ProtectedRoute>} />
              <Route path="/analysis" element={<ProtectedRoute><BiasAnalysis /></ProtectedRoute>} />
              <Route path="/risk-profile" element={<ProtectedRoute><RiskProfile /></ProtectedRoute>} />
              <Route path="/ai-coach" element={<ProtectedRoute><AICoach /></ProtectedRoute>} />
              <Route path="/emotions" element={<ProtectedRoute><EmotionalTracker /></ProtectedRoute>} />
              <Route path="/portfolio" element={<ProtectedRoute><Portfolio /></ProtectedRoute>} />
              <Route path="/trades" element={<ProtectedRoute><Trades /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
