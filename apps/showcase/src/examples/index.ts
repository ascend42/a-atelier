import type { AtelierDocument } from "@a-company/atelier-types";
import { shapesExamples } from "./shapes.js";
import { easingExamples } from "./easing.js";
import { motionExamples } from "./motion.js";
import { stylesExamples } from "./styles.js";
import { compositionExamples } from "./composition.js";
import { presetsExamples } from "./presets.js";
import { templatesExamples } from "./templates.js";
import { statesExamples } from "./states.js";

export interface Example {
  id: string;
  name: string;
  description: string;
  category: string;
  create: () => AtelierDocument;
}

export interface Category {
  name: string;
  icon: string;
  items: Example[];
}

export const examples: Category[] = [
  { name: "Shapes", icon: "\u25CB", items: shapesExamples },
  { name: "Easing", icon: "\u223F", items: easingExamples },
  { name: "Motion", icon: "\u2192", items: motionExamples },
  { name: "Styles", icon: "\u25D2", items: stylesExamples },
  { name: "Composition", icon: "\u229E", items: compositionExamples },
  { name: "Presets", icon: "\u2606", items: presetsExamples },
  { name: "Templates", icon: "\u007B\u007D", items: templatesExamples },
  { name: "States", icon: "\u21C4", items: statesExamples },
];
