import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Loader2 } from "lucide-react";

// Eagerly loaded — these are on the critical path for first paint
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import ListingDetail from "./pages/ListingDetail";

// Lazily loaded — Insights uses Recharts (~200 KB); load only when navigated to
const Insights = lazy(() => import("./pages/Insights"));

// Lazily loaded — Dealer routes; not needed for public/admin users
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NewListing = lazy(() => import("./pages/dealer/NewListing"));
const DealerSetup = lazy(() => import("./pages/dealer/DealerSetup"));

// Lazily loaded — Admin pages; never needed by non-admin users
const FacebookGroups = lazy(() => import("./pages/admin/FacebookGroups"));
const FeedRuns = lazy(() => import("./pages/admin/FeedRuns"));
const ManualPost = lazy(() => import("./pages/admin/ManualPost"));
const Listings = lazy(() => import("./pages/admin/Listings"));
const Duplicates = lazy(() => import("./pages/admin/Duplicates"));
const ChromeExtensionSetup = lazy(() => import("./pages/admin/ChromeExtensionSetup"));
const ProcessPosts = lazy(() => import("./pages/admin/ProcessPosts"));
const PendingListings = lazy(() => import("./pages/admin/PendingListings"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
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
              <Route
                path="/listing/:id"
                element={
                  <ProtectedRoute>
                    <ListingDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/insights"
                element={
                  <ProtectedRoute>
                    <Insights />
                  </ProtectedRoute>
                }
              />
              {/* Onboarding */}
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute>
                    <Onboarding />
                  </ProtectedRoute>
                }
              />
              {/* Dealer Routes */}
              <Route
                path="/dealer/setup"
                element={
                  <ProtectedRoute>
                    <DealerSetup />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dealer/listings/new"
                element={
                  <ProtectedRoute>
                    <NewListing />
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
                path="/admin/listings/pending"
                element={
                  <ProtectedRoute requireAdmin>
                    <PendingListings />
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
              <Route
                path="/admin/duplicates"
                element={
                  <ProtectedRoute requireAdmin>
                    <Duplicates />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
