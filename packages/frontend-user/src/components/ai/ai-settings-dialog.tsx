'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Settings, Loader2, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import api from '@/lib/api-client';
import {
  AI_AGENT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_RESPONSE_MAX_TOKENS_DEFAULT,
  UserAISettings,
} from '@humanly/shared';
import { getWhitelist } from '@/lib/ai-models';

interface AISettingsDialogProps {
  onSettingsChanged?: () => void;
}

export function AISettingsDialog({ onSettingsChanged }: AISettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Form state
  const [baseUrl, setBaseUrl] = useState('https://api.together.xyz/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [responseMaxTokens, setResponseMaxTokens] = useState(AI_RESPONSE_MAX_TOKENS_DEFAULT);
  const [agentMaxTokens, setAgentMaxTokens] = useState(AI_AGENT_MAX_TOKENS_DEFAULT);

  // UI state
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [hasExisting, setHasExisting] = useState(false);

  // Known providers always use the whitelist.
  // Unknown providers fall back to API-fetched models (stored in `models`).
  const displayModels = useMemo(
    () => getWhitelist(baseUrl) ?? models,
    [baseUrl, models]
  );
  const [maskedKey, setMaskedKey] = useState('');

  // Load existing settings when dialog opens
  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/ai/settings');
      const settings: UserAISettings | null = res.data;
      if (settings && settings.hasApiKey) {
        setBaseUrl(settings.baseUrl);
        setModel(settings.model);
        setResponseMaxTokens(settings.responseMaxTokens || AI_RESPONSE_MAX_TOKENS_DEFAULT);
        setAgentMaxTokens(settings.agentMaxTokens || AI_AGENT_MAX_TOKENS_DEFAULT);
        setMaskedKey(settings.maskedApiKey || '');
        setHasExisting(true);
        setApiKey(''); // Don't pre-fill actual key
      } else {
        setHasExisting(false);
        setMaskedKey('');
        setBaseUrl('https://api.together.xyz/v1');
        setApiKey('');
        setModel('');
        setResponseMaxTokens(AI_RESPONSE_MAX_TOKENS_DEFAULT);
        setAgentMaxTokens(AI_AGENT_MAX_TOKENS_DEFAULT);
      }
    } catch {
      // No settings yet
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const keyToTest = apiKey || undefined;
    if (!keyToTest && !hasExisting) {
      setTestResult({ success: false, message: 'Please enter an API key' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    setModels([]);

    try {
      const data: any = await api.post('/ai/settings/test', {
        apiKey: keyToTest || '__use_existing__',
        baseUrl,
      });
      setTestResult({
        success: data.success,
        message: data.success ? 'Connection successful.' : data.message,
      });
      if (data.success) {
        const whitelist = getWhitelist(baseUrl);
        if (whitelist) {
          // Known provider: whitelist drives the dropdown, no need to store API models.
          // Auto-select the first whitelisted item if nothing is selected yet.
          if (!model) setModel(whitelist[0]);
        } else if (data.models?.length > 0) {
          // Unknown provider: store whatever the API returned.
          setModels(data.models);
          if (!model) setModel(data.models[0]);
        }
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.response?.data?.message || err?.message || 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!model) {
      setTestResult({ success: false, message: 'Please select a model' });
      return;
    }
    if (!apiKey && !hasExisting) {
      setTestResult({ success: false, message: 'Please enter an API key' });
      return;
    }

    setSaving(true);
    try {
      await api.put('/ai/settings', {
        apiKey: apiKey || '__use_existing__',
        baseUrl,
        model,
        responseMaxTokens,
        agentMaxTokens,
      });
      setHasExisting(true);
      setOpen(false);
      onSettingsChanged?.();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.response?.data?.error || 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete('/ai/settings');
      setHasExisting(false);
      setApiKey('');
      setMaskedKey('');
      setModel('');
      setResponseMaxTokens(AI_RESPONSE_MAX_TOKENS_DEFAULT);
      setAgentMaxTokens(AI_AGENT_MAX_TOKENS_DEFAULT);
      setModels([]);
      setTestResult(null);
      setBaseUrl('https://api.together.xyz/v1');
      setDeleteConfirmOpen(false);
      onSettingsChanged?.();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="AI Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">AI Settings</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 min-w-0">
              {/* Base URL */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Base URL</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    setTestResult(null);
                    setModels([]);
                  }}
                  placeholder="https://api.together.xyz/v1"
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Together AI or any OpenAI-compatible API with tool calling
                </p>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">API Key</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder={hasExisting ? `Current: ${maskedKey}` : 'sk-...'}
                  className="text-sm"
                />
                {hasExisting && !apiKey && (
                  <p className="text-[10px] text-muted-foreground">
                    Leave empty to keep current key
                  </p>
                )}
              </div>

              {/* Test Connection */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleTestConnection}
                disabled={testing || (!apiKey && !hasExisting)}
              >
                {testing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                    Testing connection...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>

              {/* Test Result */}
              {testResult && (
                <div
                  className={`flex items-start gap-2 rounded-lg border p-3 text-xs min-w-0 ${
                    testResult.success
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  <span className="break-words min-w-0">{testResult.message}</span>
                </div>
              )}

              {/* Model Selection */}
              {displayModels.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {displayModels.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Model (manual input only when no dropdown list is available) */}
              {displayModels.length === 0 && hasExisting && model && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Model</Label>
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="text-sm"
                    placeholder="gpt-4o"
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Response Tokens</Label>
                  <Input
                    type="number"
                    min={AI_MAX_TOKENS_MIN}
                    max={AI_MAX_TOKENS_MAX}
                    value={responseMaxTokens}
                    onChange={(e) => setResponseMaxTokens(Number(e.target.value) || AI_RESPONSE_MAX_TOKENS_DEFAULT)}
                    className="text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Quick actions and fallback answers
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Agent Tokens</Label>
                  <Input
                    type="number"
                    min={AI_MAX_TOKENS_MIN}
                    max={AI_MAX_TOKENS_MAX}
                    value={agentMaxTokens}
                    onChange={(e) => setAgentMaxTokens(Number(e.target.value) || AI_AGENT_MAX_TOKENS_DEFAULT)}
                    className="text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Chat turns with retrieval tools
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleSave}
                  disabled={saving || (!model) || (!apiKey && !hasExisting)}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>

                {hasExisting && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete AI Settings?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your API key and disable AI features until you reconfigure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
