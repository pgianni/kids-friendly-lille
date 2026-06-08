import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Armchair,
  Baby,
  BabyCarriage,
  Books,
  CalendarDots,
  Coffee,
  Confetti,
  ForkKnife,
  GameController,
  GlobeHemisphereWest,
  Heart,
  MapPin,
  NavigationArrow,
  Phone,
  Plus,
  ShoppingBag,
  Shower,
  SignOut,
  Sparkle,
  Star,
  Storefront,
  SwimmingPool,
  Timer,
  Trophy,
  Tree,
  Umbrella,
  UserCircle,
  Wheelchair,
} from "@phosphor-icons/react";

const icons = {
  activity: GameController,
  address: MapPin,
  baby: Baby,
  babyCarriage: BabyCarriage,
  bottle: Baby,
  books: Books,
  cafe: Coffee,
  calendar: CalendarDots,
  chair: Armchair,
  confirm: Sparkle,
  directions: NavigationArrow,
  favorite: Heart,
  food: ForkKnife,
  globe: GlobeHemisphereWest,
  indoor: Umbrella,
  mall: ShoppingBag,
  museum: Storefront,
  phone: Phone,
  picnic: Confetti,
  play: GameController,
  pool: SwimmingPool,
  profile: UserCircle,
  search: Sparkle,
  signout: SignOut,
  sparkle: Sparkle,
  stroller: BabyCarriage,
  trophy: Trophy,
  tree: Tree,
  water: Shower,
  wheelchair: Wheelchair,
  plus: Plus,
  map: MapPin,
  time: Timer,
};

export function AppIcon({ id, size = 20, weight = "duotone", className = "", ...props }) {
  const Icon = icons[id] || Sparkle;
  return <Icon className={`app-icon ${className}`.trim()} size={size} weight={weight} aria-hidden="true" {...props} />;
}

export function iconMarkup(id, size = 22, weight = "duotone") {
  return renderToStaticMarkup(<AppIcon id={id} size={size} weight={weight} />);
}

export { icons };
