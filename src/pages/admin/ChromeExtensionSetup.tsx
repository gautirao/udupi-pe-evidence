import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Download, Chrome, Settings, MousePointer, Upload } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function ChromeExtensionSetup() {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const apiEndpoint = `${SUPABASE_URL}/functions/v1/ingest-posts`;

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast({ title: "Copied!", description: `${field} copied to clipboard.` });
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast({ title: "Error", description: "Failed to copy to clipboard.", variant: "destructive" });
    }
  };

  const steps = [
    {
      number: 1,
      title: "Download the Extension",
      icon: Download,
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The Chrome extension is located in the <code className="bg-muted px-1.5 py-0.5 rounded text-xs">chrome-extension/</code> folder of this project.
          </p>
          <p className="text-sm text-muted-foreground">
            You can get it by:
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
            <li>Syncing the project via GitHub</li>
            <li>Or downloading the project as a ZIP file</li>
          </ul>
        </div>
      ),
    },
    {
      number: 2,
      title: "Load in Chrome",
      icon: Chrome,
      content: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-2">
            <li>Open Chrome and navigate to <code className="bg-muted px-1.5 py-0.5 rounded text-xs">chrome://extensions/</code></li>
            <li>Enable <strong>Developer Mode</strong> (toggle in top-right corner)</li>
            <li>Click <strong>"Load unpacked"</strong></li>
            <li>Select the <code className="bg-muted px-1.5 py-0.5 rounded text-xs">chrome-extension</code> folder</li>
          </ol>
        </div>
      ),
    },
    {
      number: 3,
      title: "Configure the Extension",
      icon: Settings,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Click the extension icon in Chrome and enter the following credentials:
          </p>
          
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="api-url" className="text-xs font-medium">API Endpoint URL</Label>
              <div className="flex gap-2">
                <Input
                  id="api-url"
                  value={apiEndpoint}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(apiEndpoint, "API Endpoint")}
                >
                  {copiedField === "API Endpoint" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key" className="text-xs font-medium">API Key (Anon Key)</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  value={SUPABASE_ANON_KEY || ""}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(SUPABASE_ANON_KEY || "", "API Key")}
                >
                  {copiedField === "API Key" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Click <strong>"Save Config"</strong> in the extension popup after entering these values.
          </p>
        </div>
      ),
    },
    {
      number: 4,
      title: "Extract Posts from Facebook",
      icon: MousePointer,
      content: (
        <div className="space-y-3">
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2 ml-2">
            <li>Navigate to a Facebook Group page</li>
            <li>Scroll through posts to load them into the page</li>
            <li>Click the extension icon to open the popup</li>
            <li>Use <strong>"Select All"</strong> or click individual posts</li>
            <li>Click <strong>"Extract Selected"</strong> to send posts to the database</li>
          </ol>
        </div>
      ),
    },
    {
      number: 5,
      title: "Review Imported Posts",
      icon: Upload,
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            After extraction, posts will appear in the <strong>Feed Runs</strong> page and can be viewed in the <strong>Manual Post</strong> section.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" asChild>
              <a href="/admin/feed-runs">View Feed Runs</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/admin/manual-post">View Raw Posts</a>
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Chrome className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Chrome Extension Setup</h1>
          </div>
          <p className="text-muted-foreground">
            Install and configure the Chrome extension to extract property listings from Facebook Groups.
          </p>
        </div>

        <div className="space-y-4">
          {steps.map((step) => (
            <Card key={step.number}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="h-8 w-8 rounded-full flex items-center justify-center p-0 text-sm font-semibold">
                    {step.number}
                  </Badge>
                  <step.icon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">{step.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pl-14">
                {step.content}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-6 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-800 dark:text-amber-200">💡 Tips</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-amber-700 dark:text-amber-300 space-y-2">
            <p>• The extension only works on Facebook Group pages (URLs containing <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">/groups/</code>)</p>
            <p>• Scroll down to load more posts before selecting them</p>
            <p>• Posts with less than 10 characters of text are automatically filtered out</p>
            <p>• Each extraction creates a new "Feed Run" for tracking</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
