'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const SECTION_TITLE_CLASS = 'text-[26px] font-semibold leading-tight tracking-normal';
const WARNING_BADGE_CLASS = 'border-[#d8ccba] bg-[#f2efe8] text-[#6a6256]';

type ReviewSignal = {
  title: string;
  description: string;
  fields: Array<{
    label: string;
    value: string;
  }>;
};

const reviewSignals: ReviewSignal[] = [
  {
    title: 'Rapid text accumulation',
    description: 'A large amount of text appeared within a short time window.',
    fields: [
      { label: 'Added characters', value: '433' },
      { label: 'Time window', value: '8 seconds' },
      { label: 'Source', value: 'After refocus' },
    ],
  },
  {
    title: 'Large paste volume',
    description: 'A substantial portion of the writing process came from pasted content.',
    fields: [
      { label: 'Pasted characters', value: '1,700' },
      { label: 'Paste events', value: '3' },
      { label: 'Final text share', value: '72%' },
    ],
  },
  {
    title: 'Copy-paste policy violation',
    description: 'Paste activity occurred when the task policy restricted copy-paste.',
    fields: [
      { label: 'Policy', value: 'Copy-paste restricted' },
      { label: 'Paste events', value: '2' },
      { label: 'Pasted characters', value: '486' },
    ],
  },
  {
    title: 'Chat refusal',
    description: 'The in-platform AI assistant refused a request because it conflicted with the writing policy.',
    fields: [
      { label: 'Refusal count', value: '2' },
      { label: 'Example user request', value: '"Write the final answer for me."' },
      { label: 'Policy status', value: 'Blocked by writing policy' },
    ],
  },
  {
    title: 'Repeated workspace exits',
    description: 'The writer repeatedly left and returned to the workspace during the session.',
    fields: [
      { label: 'Exit count', value: '7' },
      { label: 'Total away time', value: '12min 40s' },
      { label: 'Longest away period', value: '4min 18s' },
    ],
  },
];

function SignalCard({ signal }: { signal: ReviewSignal }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={WARNING_BADGE_CLASS}>
          Review
        </Badge>
        <p className="font-medium">{signal.title}</p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{signal.description}</p>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {signal.fields.map((field) => (
          <div key={field.label} className="rounded-md bg-background/70 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{field.label}</p>
            <p className="mt-0.5 break-words font-medium">{field.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AbnormalBehaviorReviewMockupPage() {
  const [behaviorReviewOpen, setBehaviorReviewOpen] = useState(true);

  return (
    <main className="humanly-page">
      <Card>
        <Collapsible open={behaviorReviewOpen} onOpenChange={setBehaviorReviewOpen}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className={SECTION_TITLE_CLASS}>Abnormal Behavior Review</CardTitle>
                <CardDescription>
                  Review write-time signals that may need attention. These are evidence for review, not automatic
                  verdicts.
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1"
                  aria-label={
                    behaviorReviewOpen
                      ? 'Hide abnormal behavior review section'
                      : 'Show abnormal behavior review section'
                  }
                >
                  {behaviorReviewOpen ? 'Hide' : 'Show'}
                  <ChevronDown className={`h-4 w-4 transition-transform ${behaviorReviewOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {reviewSignals.map((signal) => (
                  <SignalCard key={signal.title} signal={signal} />
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </main>
  );
}
