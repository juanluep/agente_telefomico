"use client";

/** Reexporta iconos Phosphor tras la frontera "use client". Los componentes
 *  de servidor no pueden importar @phosphor-icons/react directamente porque
 *  usa React.createContext, que no existe en el bundle de RSC de Next 16. */
export {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Gear,
  Gauge,
  List,
  Moon,
  NotePencil,
  Phone,
  PhoneOutgoing,
  PlugsConnected,
  SignOut,
  Sun,
  UserCircle,
  Users,
  X,
} from "@phosphor-icons/react";