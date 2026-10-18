import { Footer } from "@/components/landing/footer";
import { Nav } from "@/components/landing/nav";
import { Demo, Features, FinalCta, Hero, HowItWorks, Numbers, Problem, QuestionsMarquee, UnderTheHood } from "@/components/landing/sections";
import { SmoothScroll } from "@/components/smooth-scroll";

export default function Landing() {
  return (
    <SmoothScroll>
      <Nav />
      <main>
        <Hero />
        <QuestionsMarquee />
        <Problem />
        <HowItWorks />
        <Features />
        <Numbers />
        <Demo />
        <UnderTheHood />
        <FinalCta />
      </main>
      <Footer />
    </SmoothScroll>
  );
}
