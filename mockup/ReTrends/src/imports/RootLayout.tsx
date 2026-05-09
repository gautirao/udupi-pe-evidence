import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router';
import { MapPin, TrendingUp, Bookmark, User, Menu, X } from 'lucide-react';
import { Button } from './ui/button';
import { SignInDialog } from './shared/SignInDialog';

export function RootLayout() {
  const location = useLocation();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleSignIn = () => {
    setIsSignedIn(true);
    setShowSignIn(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                <MapPin className="text-white" size={20} strokeWidth={2.5} />
              </div>
              <div>
                <div className="font-bold text-xl text-gray-900 group-hover:text-blue-600 transition-colors">
                  ReTrends
                </div>
                <div className="text-xs text-gray-500 -mt-1">Real Estate Trends</div>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              <Link to="/discover">
                <Button
                  variant={isActive('/discover') ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-2"
                >
                  <MapPin size={16} />
                  Discover
                </Button>
              </Link>
              <Link to="/trends">
                <Button
                  variant={isActive('/trends') ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-2"
                >
                  <TrendingUp size={16} />
                  Trends
                </Button>
              </Link>
              <Link to="/saved">
                <Button
                  variant={isActive('/saved') ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-2"
                >
                  <Bookmark size={16} />
                  Saved
                </Button>
              </Link>
            </nav>

            {/* User Actions */}
            <div className="flex items-center gap-2">
              {isSignedIn ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 hidden md:flex"
                  onClick={() => setIsSignedIn(false)}
                >
                  <User size={16} />
                  <span>Priya K.</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden md:flex"
                  onClick={() => setShowSignIn(true)}
                >
                  Sign In
                </Button>
              )}

              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-200">
              <nav className="flex flex-col gap-2">
                <Link to="/discover" onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant={isActive('/discover') ? 'default' : 'ghost'}
                    size="sm"
                    className="w-full justify-start gap-2"
                  >
                    <MapPin size={16} />
                    Discover
                  </Button>
                </Link>
                <Link to="/trends" onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant={isActive('/trends') ? 'default' : 'ghost'}
                    size="sm"
                    className="w-full justify-start gap-2"
                  >
                    <TrendingUp size={16} />
                    Trends
                  </Button>
                </Link>
                <Link to="/saved" onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant={isActive('/saved') ? 'default' : 'ghost'}
                    size="sm"
                    className="w-full justify-start gap-2"
                  >
                    <Bookmark size={16} />
                    Saved
                  </Button>
                </Link>
                <div className="pt-2 border-t border-gray-200 mt-2">
                  {isSignedIn ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start gap-2"
                      onClick={() => setIsSignedIn(false)}
                    >
                      <User size={16} />
                      Priya K.
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setShowSignIn(true);
                        setMobileMenuOpen(false);
                      }}
                    >
                      Sign In
                    </Button>
                  )}
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main>
        <Outlet context={{ isSignedIn, setShowSignIn, setIsSignedIn }} />
      </main>

      {/* Sign In Dialog */}
      <SignInDialog
        open={showSignIn}
        onOpenChange={setShowSignIn}
        onSignIn={handleSignIn}
      />
    </div>
  );
}
