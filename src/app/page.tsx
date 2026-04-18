import Header from '@/components/Header';
import HeroSection from '@/components/HeroSection';
import CoreFeatures from '@/components/CoreFeatures';
import RoleCapabilities from '@/components/RoleCapabilities';
import EnterpriseSecurity from '@/components/EnterpriseSecurity';
import CTA from '@/components/CTA';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <Header />
      <HeroSection />
      <CoreFeatures />
      <RoleCapabilities />
      <EnterpriseSecurity />
      <CTA />
      <Footer />
    </main>
  );
}
