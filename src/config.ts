import type { Site, SocialObjects } from "./types";

export const SITE: Site = {
  website: "https://blnkt.github.io/astro-pages-cms-blog/",
  author: "Spirit Machine",
  desc: "Spirit Machine is a community choir in Portland, Oregon. Eclectic repertoire, Thursday rehearsals, no audition—join us for the Spring 2026 season.",
  title: "Spirit Machine",
  ogImage: "og-default.svg",
  lightAndDarkMode: true,
  postPerPage: 5,
  scheduledPostMargin: 15 * 60 * 1000,
};

export const CONTACT_EMAIL = "hello@spiritmachine.example";
export const DONATE_URL = "https://example.com/donate";
/** Build-time soft-lock password for member-only pages (normalized client-side). */
export const MEMBER_SOFT_LOCK_PASSWORD = "spiritmachine";
export const TAGLINE =
  "A community choir dedicated to working hard, making great music, and having a great time";

export const LOCALE = {
  lang: "en",
  langTag: ["en-US"],
} as const;

export const LOGO_IMAGE = {
  enable: true,
  svg: false,
  width: 48,
  height: 48,
};

export const SOCIALS: SocialObjects = [
  {
    name: "YouTube",
    href: "https://www.youtube.com/",
    linkTitle: `${SITE.title} on YouTube`,
    active: true,
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/",
    linkTitle: `${SITE.title} on Instagram`,
    active: true,
  },
  {
    name: "Spotify",
    href: "https://open.spotify.com/",
    linkTitle: `${SITE.title} on Spotify`,
    active: true,
  },
  {
    name: "Mail",
    href: `mailto:${CONTACT_EMAIL}`,
    linkTitle: `Email ${SITE.title}`,
    active: true,
  },
];
