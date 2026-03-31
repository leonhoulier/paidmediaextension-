import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePairExtension } from '@/hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Puzzle,
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Building2,
  Key,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Extension Pairing page - allows admins to pair Chrome extensions with user accounts.
 *
 * The pairing flow:
 * 1. Admin enters the buyer's email address
 * 2. System generates an extension token for that user
 * 3. The token and org info are displayed for the buyer to enter into the extension
 */
export function ExtensionPairing(): React.ReactElement {
  const { user } = useAuth();
  const pairExtension = usePairExtension();

  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);

  const handlePair = async (): Promise<void> => {
    const targetEmail = email.trim() || user?.email;
    if (!targetEmail) {
      toast.error('Please enter an email address.');
      return;
    }

    try {
      await pairExtension.mutateAsync({ email: targetEmail });
      toast.success('Extension paired successfully');
    } catch {
      toast.error('Failed to pair extension. Check the email and try again.');
    }
  };

  const handleCopyToken = async (): Promise<void> => {
    if (!pairExtension.data?.extension_token) return;
    try {
      await navigator.clipboard.writeText(pairExtension.data.extension_token);
      setCopied(true);
      toast.success('Token copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy token. Please select and copy manually.');
    }
  };

  const handleReset = (): void => {
    pairExtension.reset();
    setEmail('');
    setCopied(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Extension Pairing</h1>
        <p className="mt-1 text-muted-foreground">
          Pair the Chrome extension with a user account to enable real-time governance checks.
        </p>
      </div>

      {/* How it works */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">How It Works</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <Badge variant="secondary" className="h-6 w-6 shrink-0 justify-center rounded-full p-0 text-xs">1</Badge>
              <span>Enter the email address of the media buyer who needs the extension.</span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary" className="h-6 w-6 shrink-0 justify-center rounded-full p-0 text-xs">2</Badge>
              <span>Click "Generate Token" to create an extension pairing token.</span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary" className="h-6 w-6 shrink-0 justify-center rounded-full p-0 text-xs">3</Badge>
              <span>Share the token with the buyer. They enter it in the Chrome extension popup to activate governance rules.</span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Pairing Form */}
      {!pairExtension.data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pair Extension</CardTitle>
            <CardDescription>
              Generate a pairing token for a user. Leave email blank to pair your own account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">User Email</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={user?.email ?? 'buyer@example.com'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handlePair();
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={handlePair}
                  disabled={pairExtension.isPending}
                  className="gap-2"
                >
                  {pairExtension.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4" />
                  )}
                  Generate Token
                </Button>
              </div>
            </div>

            {pairExtension.isError && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">
                  Failed to pair extension. The email may not exist in the system or the user may not belong to your organization.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Success State - Show Token and Org Info */
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <CardTitle className="text-lg">Extension Paired Successfully</CardTitle>
            </div>
            <CardDescription>
              Share the token below with the media buyer to activate their extension.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Organization Info */}
            <div className="flex items-center gap-3 rounded-md bg-background p-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{pairExtension.data.organization.name}</p>
                <p className="text-xs text-muted-foreground">
                  Org: {pairExtension.data.organization.slug}
                </p>
              </div>
            </div>

            <Separator />

            {/* Extension Token */}
            <div className="space-y-2">
              <Label>Extension Token</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={pairExtension.data.extension_token}
                  className="font-mono text-sm"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  onClick={handleCopyToken}
                  className="gap-2 shrink-0"
                  aria-label="Copy token to clipboard"
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The buyer should enter this token in the extension popup under "Settings &gt; Pair Token".
              </p>
            </div>

            <Separator />

            <Button variant="outline" onClick={handleReset} className="w-full">
              Pair Another Extension
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
