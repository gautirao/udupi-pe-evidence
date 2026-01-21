import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import FacebookGroups from "./pages/admin/FacebookGroups";
import FeedRuns from "./pages/admin/FeedRuns";
import ManualPost from "./pages/admin/ManualPost";
import Listings from "./pages/admin/Listings";
import ChromeExtensionSetup from "./pages/admin/ChromeExtensionSetup";
import ProcessPosts from "./pages/admin/ProcessPosts";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            {/* Admin Routes */}
            <Route
              path="/admin/groups"
              element={
                <ProtectedRoute requireAdmin>
                  <FacebookGroups />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/feeds"
              element={
                <ProtectedRoute requireAdmin>
                  <FeedRuns />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/posts"
              element={
                <ProtectedRoute requireAdmin>
                  <ManualPost />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/listings"
              element={
                <ProtectedRoute requireAdmin>
                  <Listings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/extension"
              element={
                <ProtectedRoute requireAdmin>
                  <ChromeExtensionSetup />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/process"
              element={
                <ProtectedRoute requireAdmin>
                  <ProcessPosts />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;