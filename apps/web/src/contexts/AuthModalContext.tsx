import React, { createContext, useContext, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AuthForms } from '@/components/auth/AuthForms';

export interface AuthModalOptions {
  returnTo?: string;
  redirect?: string;
  initialTab?: string;
}

interface AuthModalContextType {
  isOpen: boolean;
  openAuthModal: (options?: AuthModalOptions) => void;
  closeAuthModal: () => void;
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<AuthModalOptions>({});
  const location = useLocation();
  const navigate = useNavigate();

  const openAuthModal = useCallback((opts?: AuthModalOptions) => {
    setOptions(opts || {});
    setIsOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSuccess = useCallback(() => {
    setIsOpen(false);
    const currentPath = `${location.pathname}${location.search}`;
    const target = options.redirect || options.returnTo;
    if (target && target !== currentPath) {
      navigate(target);
    }
  }, [location.pathname, location.search, options.redirect, options.returnTo, navigate]);

  return (
    <AuthModalContext.Provider value={{ isOpen, openAuthModal, closeAuthModal }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md p-6 bg-background">
          <DialogTitle className="sr-only">Authentication</DialogTitle>
          <DialogDescription className="sr-only">Sign in or sign up to continue</DialogDescription>
          <AuthForms
            returnTo={options.redirect || options.returnTo || `${location.pathname}${location.search}`}
            onSuccess={handleSuccess}
            initialTab={options.initialTab}
          />
        </DialogContent>
      </Dialog>
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (!context) {
    return {
      isOpen: false,
      openAuthModal: () => {},
      closeAuthModal: () => {},
    };
  }
  return context;
}
