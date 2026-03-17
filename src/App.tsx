import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from "react-router-dom";
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

// Lazily loaded — Broker routes; not needed for public/admin users
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NewListing = lazy(() => import("./pages/broker/NewListing"));
const EditListing = lazy(() => import("./pages/broker/EditListing"));
const BrokerSetup = lazy(() => import("./pages/broker/BrokerSetup"));
const BrokerDashboard = lazy(() => import("./pages/broker/BrokerDashboard"));
const BrokerListings = lazy(() => import("./pages/broker/BrokerListings"));
const BrokerBookings = lazy(() => import("./pages/broker/BrokerBookings"));
const MyBookings = lazy(() => import("./pages/MyBookings"));
const SavedAreas = lazy(() => import("./pages/SavedAreas"));

// Lazily loaded — Admin pages; never needed by non-admin users
const FacebookGroups = lazy(() => import("./pages/admin/FacebookGroups"));
const FeedRuns = lazy(() => import("./pages/admin/FeedRuns"));
const ManualPost = lazy(() => import("./pages/admin/ManualPost"));
const Listings = lazy(() => import("./pages/admin/Listings"));
const SuspectedDuplicates = lazy(() => import("./pages/admin/SuspectedDuplicates"));
const ChromeExtensionSetup = lazy(() => import("./pages/admin/ChromeExtensionSetup"));
const ProcessPosts = lazy(() => import("./pages/admin/ProcessPosts"));
const PendingListings = lazy(() => import("./pages/admin/PendingListings"));
const LocalityNormalizer = lazy(() => import("./pages/admin/LocalityNormalizer"));
const AuditLog = lazy(() => import("./pages/admin/AuditLog"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/** Redirect /dealer/listings/:id/edit?... → /broker/listings/:id/edit?... preserving query params */
function BrokerListingEditRedirect() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const query = searchParams.toString();
  return <Navigate to={`/broker/listings/${id}/edit${query ? `?${query}` : ''}`} replace />;
}

/** Redirect /dealer/listings?... → /broker/listings?... preserving query params */
function BrokerListingsRedirect() {
  const [searchParams] = useSearchParams();
  const query = searchParams.toString();
  return <Navigate to={`/broker/listings${query ? `?${query}` : ''}`} replace />;
}

/** Redirect /dealer/bookings?... → /broker/bookings?... preserving query params */
function BrokerBookingsRedirect() {
  const [searchParams] = useSearchParams();
  const query = searchParams.toString();
  return <Navigate to={`/broker/bookings${query ? `?${query}` : ''}`} replace />;
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
              {/* Broker Routes */}
              <Route
                path="/broker/setup"
                element={
                  <ProtectedRoute>
                    <BrokerSetup />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/broker/listings/new"
                element={
                  <ProtectedRoute>
                    <NewListing />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/broker/listings/:id/edit"
                element={
                  <ProtectedRoute>
                    <EditListing />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/broker/dashboard"
                element={
                  <ProtectedRoute>
                    <BrokerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/broker/listings"
                element={
                  <ProtectedRoute>
                    <BrokerListings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/broker/bookings"
                element={
                  <ProtectedRoute>
                    <BrokerBookings />
                  </ProtectedRoute>
                }
              />
              {/* Legacy /dealer/* redirects — preserve query params via window.location */}
              <Route path="/dealer/setup" element={<Navigate to="/broker/setup" replace />} />
              <Route path="/dealer/dashboard" element={<Navigate to="/broker/dashboard" replace />} />
              <Route path="/dealer/listings/new" element={<Navigate to="/broker/listings/new" replace />} />
              <Route path="/dealer/listings/:id/edit" element={<BrokerListingEditRedirect />} />
              <Route path="/dealer/listings" element={<BrokerListingsRedirect />} />
              <Route path="/dealer/bookings" element={<BrokerBookingsRedirect />} />
              {/* User Routes */}
              <Route
                path="/my-bookings"
                element={
                  <ProtectedRoute>
                    <MyBookings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/saved-areas"
                element={
                  <ProtectedRoute>
                    <SavedAreas />
                  </ProtectedRoute>
                }
              />
              <Route path="/notifications" element={<Navigate to="/" replace />} />
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
                    <SuspectedDuplicates />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/localities"
                element={
                  <ProtectedRoute requireAdmin>
                    <LocalityNormalizer />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/audit-log"
                element={
                  <ProtectedRoute requireAdmin>
                    <AuditLog />
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
