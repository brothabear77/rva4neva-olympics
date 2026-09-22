import { redirect } from "next/navigation";

/** Info is a menu, not a page. Anyone who lands on /info anyway goes to the event guide. */
export default function InfoIndex() {
  redirect("/info/events-guide");
}
