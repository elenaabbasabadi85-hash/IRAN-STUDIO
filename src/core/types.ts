// Shared contract for all three lanes. Change only via a pull request approved by all three.
export type RoleId = 'idea' | 'script' | 'editor' | 'writer' | 'video';
export type StepStatus = 'empty' | 'working' | 'ready' | 'approved';
export type EntryPoint = 'idea' | 'raw-video';
export type RecordingMode = 'camera' | 'upload' | 'faceless';

export interface ChannelProfile {
  name: string;
  niche: string;
  audience: string;
  tone: 'formal' | 'casual' | 'mixed';
  avgLengthMin: number;
  sampleText?: string;
  colors?: { primary: string; accent: string };
}

export interface IdeaCard {
  id: string;
  workingTitle: string;
  angle: string;
  whyItWorks: string;
  audience: string;
  references?: { title: string; url: string; views?: number }[];
}

export interface ScriptSection {
  id: string;
  title: string;
  text: string;
  estSeconds: number;
}

export interface Script {
  hooks: string[];
  chosenHook: number;
  sections: ScriptSection[];
  cta: string;
  edited?: boolean;
}

export interface PublishKit {
  titles: string[];
  chosenTitle?: number;
  coverTexts: string[];
  description: string;
  hashtags: string[];
  chapters?: { start: number; title: string }[];
}

export interface TranscriptWord { w: string; start: number; end: number }
export interface Transcript { language: 'fa'; words: TranscriptWord[] }

export interface CutSegment { start: number; end: number; reason: 'silence' | 'retake' | 'manual' }
export interface ShortSuggestion { start: number; end: number; hook: string }
export interface Slide { sectionId: string; imageKey: string; start: number; end: number }

export interface OutputFile {
  kind: 'video' | 'short' | 'srt' | 'cover' | 'description';
  key: string;
  createdAt: string;
}

export interface MediaState {
  mode: RecordingMode;
  rawVideoKey?: string;
  audioKey?: string;
  transcript?: Transcript;
  cuts?: CutSegment[];
  shorts?: ShortSuggestion[];
  slides?: Slide[];
  outputs: OutputFile[];
}

export interface Project {
  id: string;
  title: string;
  entry: EntryPoint;
  channel: ChannelProfile;
  idea?: IdeaCard;
  script?: Script;
  publish?: PublishKit;
  media?: MediaState;
  steps: Record<RoleId, StepStatus>;
  createdAt: string;
  updatedAt: string;
}
