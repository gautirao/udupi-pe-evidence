import { Suspense, lazy } from "react";
import { useAuthCacheSync } from '@/hooks/useAuthCacheSync';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Loader2 } from "lucide-react";
import { DISTRICT_TO_CITY_SLUG } from "@/lib/localityUtils";
import { AppLayout } from "@/components/layout/AppLayout";

// Eagerly loaded — these are on the critical path for first paint
import MapDiscovery from "./pages/MapDiscovery";
import LandingPage from "./pages/LandingPage";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import ListingDetail from "./pages/ListingDetail";

// Lazily loaded — Trends uses Recharts (~200 KB); load only when navigated to
const Trends = lazy(() => import("./pages/Trends"));
const TrendsAreaResolved = lazy(() => import("./pages/TrendsAreaResolved"));

// Lazily loaded — Broker routes; not needed for public/admin users
const Onboarding = lazy(() => import("./pages/Onboarding"));
// Issue #1719 — the journey selector is now the base /broker/listings/new
// landing, replacing NewListing.tsx (which defaulted straight to the
// residential form per #1626 Phase-7A FIX-A). NewListing.tsx itself is left
// unmodified/unrouted (forbidden to touch per #1719 scope) — dedicated
// deep-link pages for all three property families now cover its old role.
const NewListingJourneySelector = lazy(() => import("./pages/broker/NewListingJourneySelector"));
const ResidentialNewListingPage = lazy(() => import("./pages/broker/ResidentialNewListingPage"));
const CommercialNewListingPage = lazy(() => import("./pages/broker/CommercialNewListingPage"));
const AgriculturalNewListingPage = lazy(() => import("./pages/broker/AgriculturalNewListingPage"));
const EditListing = lazy(() => import("./pages/broker/EditListing"));
const BrokerSetup = lazy(() => import("./pages/broker/BrokerSetup"));
const BrokerDashboard = lazy(() => import("./pages/broker/BrokerDashboard"));
const BrokerListings = lazy(() => import("./pages/broker/BrokerListings"));
const BrokerBookings = lazy(() => import("./pages/broker/BrokerBookings"));
const BrokerListingQuality = lazy(() => import("./pages/broker/ListingQuality"));
const BrokerPreferences = lazy(() => import("./pages/broker/Preferences"));
const BrokerDemandGaps = lazy(() => import("./pages/broker/BrokerDemandGaps"));
const BrokerAreaInsights = lazy(() => import("./pages/broker/BrokerAreaInsights"));
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
const TrustReviewQueue = lazy(() => import("./pages/admin/TrustReviewQueue"));
const Intelligence = lazy(() => import("./pages/admin/Intelligence"));

const queryClient = new QueryClient();

/** Mounts cache-invalidation side-effects that need both QueryClient and AuthContext. */
function AppCacheSync() {
  useAuthCacheSync();
  return null;
}

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
          <AuthModalProvider>
            <AppCacheSync />
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/" element={<LandingPage />} />
              <Route path="/discover" element={<MapDiscovery />} />
              <Route path="/listing/:id" element={<ListingDetail />} />
              <Route path="/trends" element={<AppLayout><Trends /></AppLayout>} />
              <Route path="/trends/:citySlug/areas/:areaSlug" element={<AppLayout><TrendsAreaResolved /></AppLayout>} />
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
              {/* Issue #1719 — journey selector; picks residential/commercial/agricultural */}
              <Route
                path="/broker/listings/new"
                element={
                  <ProtectedRoute>
                    <NewListingJourneySelector />
                  </ProtectedRoute>
                }
              />
              {/* Issue #1719 — direct deep link into the residential single-page create flow */}
              <Route
                path="/broker/listings/new/residential"
                element={
                  <ProtectedRoute>
                    <ResidentialNewListingPage />
                  </ProtectedRoute>
                }
              />
              {/* #1741 follow-up — direct deep link into the commercial single-page create flow */}
              <Route
                path="/broker/listings/new/commercial"
                element={
                  <ProtectedRoute>
                    <CommercialNewListingPage />
                  </ProtectedRoute>
                }
              />
              {/* Issue #1627 — direct deep link into the agricultural single-page create flow */}
              <Route
                path="/broker/listings/new/agricultural"
                element={
                  <ProtectedRoute>
                    <AgriculturalNewListingPage />
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
              <Route
                path="/broker/listing-quality"
                element={
                  <ProtectedRoute>
                    <BrokerListingQuality />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/broker/preferences"
                element={
                  <ProtectedRoute>
                    <BrokerPreferences />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/broker/demand-gaps"
                element={
                  <ProtectedRoute>
                    <BrokerDemandGaps />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/broker/areas/:citySlug/:areaKey"
                element={
                  <ProtectedRoute>
                    <BrokerAreaInsights />
                  </ProtectedRoute>
                }
              />

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
              <Route
                path="/admin/trust-review"
                element={
                  <ProtectedRoute requireAdmin>
                    <TrustReviewQueue />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/intelligence"
                element={
                  <ProtectedRoute requireAdmin>
                    <Intelligence />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </AuthModalProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
