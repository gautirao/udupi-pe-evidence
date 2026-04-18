import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ShieldCheck, Mail, Lock } from 'lucide-react';

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: string;
  onSignIn?: () => void;
}

export function SignInDialog({ open, onOpenChange, reason, onSignIn }: SignInDialogProps) {
  const handleSignIn = () => {
    // Mock sign in
    if (onSignIn) {
      onSignIn();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to ReTrends</DialogTitle>
          <DialogDescription>
            {reason || 'Sign in to access full property details, save searches, and connect with verified brokers.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="pl-10"
              />
            </div>
          </div>

          <Button onClick={handleSignIn} className="w-full">
            Sign In
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or continue with</span>
            </div>
          </div>

          <Button variant="outline" className="w-full">
            Continue with Google
          </Button>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
            <div className="flex gap-3">
              <ShieldCheck className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
              <div className="text-sm">
                <p className="font-medium text-blue-900 mb-1">Why sign in?</p>
                <ul className="text-blue-700 space-y-1 text-xs">
                  <li>• View full property details and contact info</li>
                  <li>• Save searches and get instant alerts</li>
                  <li>• Access verified broker profiles</li>
                  <li>• Request property viewings</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
