// Front-of-pipeline artifact schemas — DESIGN.md, SCRIPT.md, STORYBOARD.md.
// See `docs/keynote/paradigm/atelier-front-of-pipeline-artifacts.md`.

export {
  SlotKindSchema,
  SlotRefSchema,
  SLOT_KINDS,
  parseSlotRef,
  type SlotKind,
} from "./slot.js";

export {
  TechniqueLibrarySchema,
  TECHNIQUE_LIBRARY_V1,
  TECHNIQUE_LIBRARY_V2,
  TECHNIQUE_LIBRARIES,
  CURRENT_TECHNIQUE_LIBRARY_VERSION,
  getTechniqueLibrary,
  type TechniqueLibrary,
} from "./technique.js";

export {
  DesignArtifactSchema,
  DesignAudienceSchema,
  DesignVoiceSchema,
  VisualRegisterSchema,
  PaletteEntrySchema,
  PaletteRoleSchema,
  TypographyEntrySchema,
  TypographyUsageSchema,
  MotionRegisterSchema,
  DesignConstraintsSchema,
  AspectRatioSchema,
  BrandReferencesSchema,
  BrandLogoSchema,
  BrandHandleSchema,
  DesignVarianceSchema,
  type DesignArtifact,
} from "./design.js";

export {
  ScriptArtifactSchema,
  NarratedScriptSchema,
  CarouselScriptSchema,
  TextOnlyScriptSchema,
  NarratedBeatSchema,
  NonNarratedBeatSchema,
  NarratedBlocksSchema,
  ScriptBeatIdSchema,
  allScriptBeats,
  type ScriptArtifact,
  type NarratedScript,
  type CarouselScript,
  type TextOnlyScript,
  type NarratedBeat,
  type NonNarratedBeat,
} from "./script.js";

export {
  StoryboardArtifactSchema,
  StoryboardBeatSchema,
  BeatWindowSchema,
  CameraSchema,
  MoodSchema,
  TransitionKindSchema,
  TransitionOutSchema,
  SfxEntrySchema,
  StoryboardAspectRatioSchema,
  isBRollBeatId,
  type StoryboardBeat,
  type StoryboardArtifact,
} from "./storyboard.js";

export {
  parseDesign,
  parseScript,
  parseStoryboard,
  serializeDesign,
  serializeScript,
  serializeStoryboard,
  splitFrontmatter,
  type FrontmatterSplit,
} from "./parse.js";

export {
  validateArtifactSet,
  type ArtifactSet,
  type ArtifactSetValidationResult,
} from "./validate.js";
