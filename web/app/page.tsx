import Commands from "@/components/Commands";
import Features from "@/components/Features";
import Hero from "@/components/Hero";
import Mcp from "@/components/Mcp";
import Nav from "@/components/Nav";
import Themes from "@/components/Themes";

export default function Home() {
  return (
    <div className="wrap">
      <Nav />
      <Hero />
      <Features />
      <Mcp />
      <Commands />
      <Themes />
    </div>
  );
}
