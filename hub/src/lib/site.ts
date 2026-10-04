import YAML from "yaml";
import profileSource from '../data/profile.yaml?raw';
import navigationSource from '../data/navigation.yaml?raw';
import changelogSource from '../data/changelog.yaml?raw';
import homepageSource from '../data/homepage.yaml?raw';
import { DEFAULT_HOMEPAGE, HOMEPAGE_SECTION_IDS } from './owner/policy.mjs';
const profileData = YAML.parse(profileSource);
export const profile = {
  tagline: '',
  heroFirstLine: profileData.displayName,
  heroSecondLine: profileData.degree,
  role: '',
  affiliation: profileData.university,
  secondDegreeShort: profileData.secondDegree,
  bioZh: '',
  email: '',
  github: '',
  avatar: '',
  location: '',
  cvPdf: '',
  ...profileData,
  // Optional sections remain usable when omitted from the YAML profile.
  ...Object.fromEntries([
    'researchInterests', 'currently', 'education', 'timeline', 'skills',
    'tools', 'links', 'publications', 'honors', 'presentations', 'futureInterests',
  ].map(key => [key, profileData[key] ?? []])),
};
export const navigation = YAML.parse(navigationSource) as { label: string; href: string }[];
export const changelog = YAML.parse(changelogSource) as { date: string; title: string; description: string }[];
export type HomepageSection = { id: string; order: number; visible: boolean; title?: string };
const homepageData = YAML.parse(homepageSource);
export const homepageSections: HomepageSection[] = (
  Array.isArray(homepageData?.sections) ? homepageData.sections : DEFAULT_HOMEPAGE.sections
).filter((section: HomepageSection) => HOMEPAGE_SECTION_IDS.includes(section.id))
  .sort((a: HomepageSection, b: HomepageSection) => a.order - b.order);
export const siteConfig = {
  site: process.env.SITE_URL || "https://example.com",
  base: import.meta.env.BASE_URL,
  repo: process.env.REPO_URL || "",
};
export function url(path = "/") {
  if (/^(https?:|mailto:|#|data:)/.test(path)) return path;
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
export function tagSlug(tag: string) {
  return tag
    .toLowerCase()
    .normalize("NFKC")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}
export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(date));
}
