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
