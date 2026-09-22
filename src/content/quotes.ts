import type { QuoteInput } from "@/lib/quotes";

/**
 * Quotes that rotate under the countdown, in this order.
 *
 * Add one line per quote:
 *
 *   { text: "The quote itself.", author: "Who said it" },
 *
 *   - `author` is optional. Leave it out for an unattributed line.
 *   - Don't add quotation marks; they're added for you. (If you paste some in,
 *     the outer pair is removed.)
 *   - If the text contains a double quote, wrap it in single quotes or
 *     backticks instead:  text: 'He said "go" and we went.'
 *   - Blank entries are skipped, and the carousel stays hidden until at least
 *     one quote is here.
 *
 * Each quote stays up for 5 seconds. To try it out, un-comment the example below.
 */
export const QUOTES: QuoteInput[] = [
  // { text: "Your first quote goes here.", author: "Whoever said it" },
  { text: "I’m just gonna say it I think I’m beating u in raw athleticism Ahmed u pushing 30 fat and crippled", author: "David"},
  { text: "guys come on i’m at least top 3. honestly top 2", author: "Pam"},
  { text: "I never see mohit in the gym (he doesn’t need it) but I see david there all the time and he never gets better", author: "Marco"},
  { text: "pam #1", author: "Pam"},
  { text: "Pam forsure near the bottom", author: "Ahmed"},
  { text: "Mohit can also squat 185 forsure. He just can’t run, jump, cut, sprint, throw, kick, etc. But that’s different", author: "Ahmed"},
  { text: "Idk about ahmed dude is crippled", author: "David"},
  { text: "come fight me immediately little boy", author: "Pam, to David"},
  { text: "that’s awful nick", author: "Pam"},
  { text: "They probably wouldn’t listen to someone fat like Ahmed", author: "Mohit"},
  { text: "I’ve seen you move, I’m not worried. Bricks for feet", author: "Ahmed, to David"},
  { text: "Let’s run it next week. Don’t hurt yourself old man", author: "David, to Ahmed"},
  { text: "And yet you stand even with pam. Shoulder to shoulder. Stand tall; you are strong", author: "Marco, to Ahmed"},
  { text: "Unironically better than you at tennis", author: "Marco, to Mohit"},
  { text: "I have a punching bag with all of your faces to remind me of what’s at stake", author: "Marco"},
  { text: "i would’ve been #1 nicky poo", author: "Pam"},
  { text: "so she’s fine with coming in last?", author: "Allen, referring to Pam"},
  { text: "See you on the distance race big dog", author: "Marco, to Nick"},
  { text: "Good luck with your one category Nick", author: "Marco"},
  { text: "So it’s settled Nick #1. Pam / Ahmed #2. David < Mohit", author: "Marco"},
  { text: "Pam you played sports in high school, I LEFT high school to play sports there is no way you think you’re more athletic than me 😭", author: "Ahmed"},
  { text: "I just don’t get where the confidence comes from with a former semi-pro athlete and a former D1 athlete in here but I don’t mind humbling people", author: "Nick"},
  
];
