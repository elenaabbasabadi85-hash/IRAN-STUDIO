import type { Script } from '@/core/types';

// Teleprompter text: the chosen hook (or the first one), every section, then the call to action.
export function scriptToPrompterText(script: Script | undefined): string {
  if (!script) return '';
  const hook = script.hooks[script.chosenHook ?? 0];
  const parts = [hook, ...script.sections.map((section) => section.text), script.cta];
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
}
