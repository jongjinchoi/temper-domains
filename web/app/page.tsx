import Commands from "@/components/Commands";
import Cta from "@/components/Cta";
import Features from "@/components/Features";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Mcp from "@/components/Mcp";
import Nav from "@/components/Nav";
import Playground from "@/components/Playground";
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
      <Playground />
      <Cta />
      <Footer />
    </div>
  );
}
