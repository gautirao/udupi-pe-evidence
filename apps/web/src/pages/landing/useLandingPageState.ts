import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { getDiscoverRoute } from '@/lib/navUtils';

// ────────────────────────────────────────────────────────────────────────────
// Landing/home state owner (Issue #2399).
//
// Owns: selected city/locality inputs, Discover navigation, and the delayed
// auth-readiness display state. No marketing JSX lives here — this is the
// single source of truth for home interaction/navigation state.
// ────────────────────────────────────────────────────────────────────────────

export interface LandingPageState {
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  locality: string;
  setLocality: (locality: string) => void;
  showAuthLoader: boolean;
  handleExplore: () => void;
}

export function useLandingPageState(): LandingPageState {
  const { isLoading } = useAuth();
  const navigate = useNavigate();
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const [locality, setLocality] = useState('');

  // Delayed-show: only render the auth spinner if it takes > 200 ms to resolve.
  // Supabase restores sessions from localStorage synchronously on most warm loads,
  // so without this gate the spinner would flicker briefly before the page renders.
  const [showAuthLoader, setShowAuthLoader] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setShowAuthLoader(false);
      return;
    }
    const t = setTimeout(() => setShowAuthLoader(true), 200);
    return () => clearTimeout(t);
  }, [isLoading]);

  const handleExplore = () => {
    navigate(getDiscoverRoute(selectedCity));
  };

  return {
    selectedCity,
    setSelectedCity,
    locality,
    setLocality,
    showAuthLoader,
    handleExplore,
  };
}
