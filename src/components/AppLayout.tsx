import { ReactNode } from 'react';
import AppSidebar from './AppSidebar';
import FloatingCoach from './FloatingCoach';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="mx-auto max-w-[1600px] px-4 md:px-8 pb-8 pt-24">
        {children}
      </main>
      <FloatingCoach />
    </div>
  );
}
