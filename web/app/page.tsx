import Colophon from "@/components/Colophon";
import Commands from "@/components/Commands";
import Cta from "@/components/Cta";
import Faq from "@/components/Faq";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Install from "@/components/Install";
import Loop from "@/components/Loop";
import Mcp from "@/components/Mcp";
import Nav from "@/components/Nav";

export default function Home() {
  return (
    <div className="wrap" id="top">
      <Nav />
      <Hero />
      <Loop />
      <Mcp />
      <Install />
      <Commands />
      <Faq />
      <Cta />
      <Colophon />
      <Footer />
    </div>
  );
}
