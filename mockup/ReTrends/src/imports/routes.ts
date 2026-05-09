import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/RootLayout";
import { HomePage } from "./components/pages/HomePage";
import { MapDiscoveryPage } from "./components/pages/MapDiscoveryPage";
import { TrendsPage } from "./components/pages/TrendsPage";
import { ListingDetailPage } from "./components/pages/ListingDetailPage";
import { SavedSearchesPage } from "./components/pages/SavedSearchesPage";
import { AreaOverviewPage } from "./components/pages/AreaOverviewPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: HomePage },
      { path: "discover", Component: MapDiscoveryPage },
      { path: "trends", Component: TrendsPage },
      { path: "trends/:locality", Component: TrendsPage },
      { path: "listing/:id", Component: ListingDetailPage },
      { path: "saved", Component: SavedSearchesPage },
      { path: "area-overview/:locality", Component: AreaOverviewPage },
    ],
  },
]);
