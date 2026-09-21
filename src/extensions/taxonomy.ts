import { createHash } from "node:crypto";
import type { Category, Facet } from "./types.ts";

export const INDUSTRIES: Category[] = [
  ["technology", "Technology", "기술", "Software, computing and technology activities"],
  ["design-arts", "Design & arts", "디자인·예술", "Design, visual arts and creative practice"],
  ["media-content", "Media & content", "미디어·콘텐츠", "Publishing, broadcasting and content creation"],
  ["commerce", "Commerce", "상거래", "Retail, trade and commerce"],
  ["professional-services", "Professional services", "전문 서비스", "Consulting and professional practice"],
  ["education-research", "Education & research", "교육·연구", "Teaching, learning and research"],
  ["finance-insurance", "Finance & insurance", "금융·보험", "Financial and insurance activities"],
  ["health-medical", "Health & medical", "건강·의료", "Health and medical activities"],
  ["food-dining", "Food & dining", "식품·외식", "Food, beverages and dining"],
  ["travel-hospitality", "Travel & hospitality", "여행·숙박", "Travel, tourism and hospitality"],
  ["property-construction", "Property & construction", "부동산·건설", "Property, buildings and construction"],
  ["sports-games-hobbies", "Sports, games & hobbies", "스포츠·게임·취미", "Sport, games and leisure activities"],
].map(([id, name, nameKo, description]) => ({ id: id!, name: name!, nameKo: nameKo!, description: description! }));

export const PURPOSES: Category[] = [
  ["general", "General", "일반", "General-purpose web presence"],
  ["company", "Company", "회사", "Company or business website"],
  ["product", "Product", "제품", "Product or application website"],
  ["store", "Store", "쇼핑몰", "Online store"],
  ["personal-portfolio", "Personal / portfolio", "개인·포트폴리오", "Personal website or portfolio"],
  ["content", "Content", "콘텐츠", "Publishing and sharing content"],
  ["community", "Community", "커뮤니티", "Groups and communities"],
  ["nonprofit", "Nonprofit", "비영리", "Nonprofit or community organisation"],
].map(([id, name, nameKo, description]) => ({ id: id!, name: name!, nameKo: nameKo!, description: description! }));

export const FACETS: { id: Facet; name: string; description: string }[] = [
  { id: "industry", name: "Industry / 분야", description: "Business or activity" },
  { id: "purpose", name: "Purpose / 용도", description: "What the website is for" },
  { id: "region", name: "Region / 지역", description: "Geographic association" },
];

// Changing these rules invalidates prior semantic review, not lookup evidence.
export const CLASSIFICATION_RULES = {
  industry: 'Require a registry purpose statement or documented activity matching the category description. General business, geography, a delegated label, or a broad marketing association without a matching activity does not establish an industry.',
  purpose: 'Require a statement describing the website use. An industry alone does not imply a company, store, portfolio, community or nonprofit website.',
  region: 'Record documented geographic association independently of industry and purpose; it is not a restriction on a user or an eligibility decision.',
  overlap: 'Assign multiple categories only when each has independent matching evidence. Preserve source claims separately from Temper inclusion decisions.',
  deferred: 'When the inspected evidence only establishes delegation, geography, or an ambiguous marketing association, record the scope and defer classification. This is not a claim that no purpose evidence exists elsewhere.',
} as const;

const industryExclusions: Record<string, string> = {
  technology: "Do not infer technology solely from an online presence or an ambiguous operator bucket (for example, energy).",
  "design-arts": "Do not infer creative practice solely from selling a product or a generic personal site.",
  "media-content": "Require publishing, broadcasting or content creation; generic communication or company contact is insufficient.",
  commerce: "Require retail, trade or selling activity; a generic company, fashion theme or broad retail promotion is insufficient.",
  "professional-services": "Require an identified professional practice or service; general business branding is insufficient.",
  "education-research": "Require teaching, learning or research use; an institutional-sounding label is insufficient.",
  "finance-insurance": "Require financial or insurance activity; price, domain investment and commercial use alone are insufficient.",
  "health-medical": "Require health, clinical, medical or care activity; generic wellbeing language alone is insufficient.",
  "food-dining": "Require food, beverages, cooking or dining; generic delivery or retail is insufficient.",
  "travel-hospitality": "Require travel, tourism or lodging activity; a place name or geographic association alone is insufficient.",
  "property-construction": "Require property, buildings or construction activity; a generic home theme alone is insufficient.",
  "sports-games-hobbies": "Require an identified sport, game or hobby; a generic fun slogan alone is insufficient.",
};
for (const category of INDUSTRIES) {
  category.inclusion = `Documented purpose or use covering: ${category.description.toLowerCase()}.`;
  category.exclusion = industryExclusions[category.id]!;
}
const purposeInclusions: Record<string, string> = {
  general: "Explicitly broad website use across activities or personal/business contexts.",
  company: "Company, business or professional practice websites explicitly described by the source.",
  product: "A website for an identified application, software or other product.",
  store: "A website explicitly used to sell goods or services online.",
  "personal-portfolio": "Personal websites, professional profiles or portfolios explicitly described by the source.",
  content: "A site explicitly used to publish, document or share articles, media or other content.",
  community: "A website for a described group, community or collaborative activity.",
  nonprofit: "A website for nonprofits, charities, mission-driven organizations or their causes.",
};
for (const category of PURPOSES) {
  category.inclusion = purposeInclusions[category.id]!;
  category.exclusion = "Do not infer this website purpose from an industry, geography, eligibility rule, price or domain spelling alone.";
}
export const CLASSIFICATION_RULES_VERSION = createHash('sha256').update(JSON.stringify([INDUSTRIES, PURPOSES, CLASSIFICATION_RULES])).digest('hex');
