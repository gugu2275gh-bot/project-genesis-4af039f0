import { useState } from 'react';
import { StepAsideAnswerEditor } from '@/components/ai-agents/flow-builder/StepAsideAnswerEditor';
import { DEFAULT_ASIDE_ANSWER } from '@/types/ai-agent-flow-builder';

/** Página temporária apenas para conferência visual do bloco de dúvidas. */
export default function PreviewAside() {
  const [value, setValue] = useState({ ...DEFAULT_ASIDE_ANSWER, mode: 'SO_RETOMAR' as const });
  return (
    <div className="max-w-2xl p-8 space-y-4">
      <p className="text-sm font-medium">Base de conhecimento</p>
      <StepAsideAnswerEditor value={value} onChange={(n) => setValue(n as any)} />
    </div>
  );
}
