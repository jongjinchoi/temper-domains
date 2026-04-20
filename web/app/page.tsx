import Features from "@/components/Features";
import Hero from "@/components/Hero";
import Nav from "@/components/Nav";

export default function Home() {
  return (
    <div className="wrap">
      <Nav />
      <Hero />
      <Features />
    </div>
  );
}
